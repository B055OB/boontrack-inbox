'use client';

// Dashboard Page: Dynamic binding for orders, inbox conversations, and financial reports
// Synchronized for multi-tenant architecture (100% dynamic, zero hardcode)

import React from 'react';
import {
  MessageSquare,
  Radio,
  Brain,
  Sparkles,
  Users,
} from 'lucide-react';
import LockedFeatureCard from './components/LockedFeatureCard';
import FeatureLockedTeaser from '@/components/shared/FeatureLockedTeaser';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getSupabase } from '@/lib/supabaseClient';
import { hasTierAccess } from '@/lib/subscription-tiers';

import DashboardShell, { useLocalStorageValue } from '@/src/components/dashboard/DashboardShell';
import LivePhonePreview from './components/preview/LivePhonePreview';
import { VisualThemeType } from './components/settings/StorefrontThemeCard';
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
import DashboardOverviewTab from '@/src/components/dashboard/DashboardOverviewTab';
import WhatsAppTab from './components/tabs/WhatsAppTab';
import AiKnowledgeTab from './components/AiKnowledgeTab';
import BiteshipCourierConfig from './components/BiteshipCourierConfig';
import WhatsAppBroadcastManager from './components/WhatsAppBroadcastManager';
import WhatsAppAutoReplyManager from './components/WhatsAppAutoReplyManager';
import WhatsAppRotatorManager from './components/WhatsAppRotatorManager';
import TelegramAlertManager from './components/TelegramAlertManager';
import BoonPilotWidget from '@/components/BoonPilotWidget';
import StoreBioLinkWidget from './components/StoreBioLinkWidget';
import ProductFormModal from './components/ProductFormModal';
import SinglePageBuilderModal from './components/SinglePageBuilderModal';
import BulkImportModal from './components/modals/BulkImportModal';
import UpsellModal from './components/modals/UpsellModal';
import UpgradePaymentModal from './components/modals/UpgradePaymentModal';
import OrdersTab from './components/tabs/OrdersTab';
import CustomerDatabaseTab from './components/tabs/CustomerDatabaseTab';
import ResellerTab from './components/tabs/ResellerTab';
import DocumentationTab from './components/tabs/DocumentationTab';
import ThemeTab from './components/tabs/ThemeTab';
import {
  ModularVerticalTabDispatcher,
  FnbInstantCourier,
  PhysicalRetailShippingTab,
  FieldServiceBookingTab,
  ProServiceCalendarTab,
  DigitalDeliveryTab,
  CreatorAgencyCampaignTab,
  resolveDomainVertical,
} from './components/modules';
import { useTenantDashboard } from './hooks/useTenantDashboard';

export default function TenantDashboardPage() {
  const {
    tenantSlug,
    tenantId,
    tenantData,
    isAuthenticated,
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
    isSubscriptionExpired,
    isGrant,
    grantValidUntil,
    grantDaysLeft,
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
    handleToggleProductActive,
    handleSaveProductForm,
    handleDeleteProduct,

    isBulkImportModalOpen,
    setIsBulkImportModalOpen,

    isSinglePageModalOpen,
    setIsSinglePageModalOpen,
    isSavingSinglePage,
    activeSinglePageProduct,
    singlePageForm,
    setSinglePageForm,
    openSinglePageBuilder,
    handleSaveSinglePageConfig,

    aiForm,
    setAiForm,
    greetingMessage,
    setGreetingMessage,
    salesPolicy,
    setSalesPolicy,
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
    qrImgError,
    setQrImgError,
    isQrLoading,
    waLoadingMessage,
    waErrorMessage,
    connectedPhone,
    setConnectedPhone,
    handleConnectGrowthSession,
    storeGreetingMessage,
    setStoreGreetingMessage,
    handleSaveGreetingMessage,
    isSavingGreeting,

    conversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    replyText,
    setReplyText,
    handleSendMessage,
    isTenantBotPaused,
    handleToggleTenantBot,

    bankForm,
    setBankForm,
    transactions,
    orders,
    setOrders,
    totalOmzet,
    readyBalance,
    isWithdrawModalOpen,
    setIsWithdrawModalOpen,
    withdrawAmount,
    setWithdrawAmount,
    isWithdrawing,
    handleProcessWithdraw,
  } = useTenantDashboard();

  const customDomain = React.useMemo(() => {
    return tenantData?.custom_domain || tenantData?.metadata?.custom_domain || null;
  }, [tenantData]);

  const tenant = React.useMemo(() => ({
    ...(tenantData || {}),
    tier: tenantFeatureFlags?.tier || (isCheckoutLite ? 'CHECKOUT_LITE' : isSoloOrTrial ? 'STARTER' : isAdsPerformance ? 'ADS_PERFORMANCE' : isTeamScale ? 'TEAM_SCALE' : 'STARTER'),
    custom_domain: customDomain,
  }), [tenantData, tenantFeatureFlags?.tier, isCheckoutLite, isSoloOrTrial, isAdsPerformance, isTeamScale, customDomain]);

  const isCrmEnabled = React.useMemo(() => {
    return isTeamScale || hasTierAccess(tenantData, 'crm');
  }, [isTeamScale, tenantData]);

  const isResellerFeatureUnlocked = React.useMemo(() => {
    return isTeamScale || hasTierAccess(tenantData, 'reseller');
  }, [isTeamScale, tenantData]);

  const renderLockedFeatureCard = (cardProps: {
    title: string;
    badge: string;
    description: string;
    targetTier: 'ads_performance' | 'team_scale';
    targetTierLabel: string;
  }) => <LockedFeatureCard {...cardProps} onUpgrade={handleUpgradeTier} />;

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

  // Theme Toggle (Light & Dark Mode)
  const [savedThemeRaw, setSavedThemeRaw] = useLocalStorageValue('boontrack_theme', 'light');
  const themeMode: 'light' | 'dark' = savedThemeRaw === 'dark' ? 'dark' : 'light';

  React.useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  const toggleTheme = React.useCallback(() => {
    setSavedThemeRaw(themeMode === 'dark' ? 'light' : 'dark');
  }, [themeMode, setSavedThemeRaw]);

  const isPreviewEnabledTab =
    activeTab === 'microsite' ||
    activeTab === 'links';

  // Guard Unauthenticated State (Defense-in-depth: No Flash of Protected Data)
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-700 dark:text-slate-300 gap-4 p-6 font-sans">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sesi Login Diperlukan</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            Akses ke dashboard toko <strong className="text-slate-900 dark:text-slate-200">{tenantSlug}</strong> dilindungi. Mengalihkan ke halaman verifikasi...
          </p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-600 dark:text-slate-400 gap-3 font-sans">
        <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs font-medium tracking-wide">Memverifikasi sesi keamanan dashboard...</span>
      </div>
    );
  }

  return (
    <>
      <DashboardShell
        tenant={tenant}
        tenantSlug={tenantSlug}
        displayName={displayName}
        storeDisplayName={storeDisplayName}
        storeLogoUrl={storeLogoUrl}
        customDomain={customDomain}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab as any)}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
        themeToggleClassName="bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-neutral-900 border-none"
        saveFeedback={saveFeedback}
        isTeamScale={isTeamScale}
        isAdsPerformance={isAdsPerformance}
        isAdsTrackingUnlocked={isAdsTrackingUnlocked}
        isSoloOrTrial={isSoloOrTrial}
        isCheckoutLite={isCheckoutLite}
        isGrant={isGrant}
        grantDaysLeft={grantDaysLeft}
        tierLabel={tierLabel}
        productCount={products.length}
        orderCount={transactions.length}
        inboxCount={conversations.length}
        storeCategory={storeCategory || businessType}
        businessType={businessType || storeCategory}
        capabilities={capabilities}
        isCrmEnabled={isCrmEnabled}
        isAiBotAllowed={Boolean(isAiBotAllowed)}
        isResellerUnlocked={isResellerFeatureUnlocked}
        onOpenStoreSettings={() => {
          setNameError(null);
          setIsStoreSettingsOpen(true);
        }}
        onOpenUpgradeModal={() => openUpgradeModal('ads_performance')}
        onOpenNewProduct={openNewProductModal}
        notificationSlot={<OrderNotificationBell tenantSlug={tenantSlug} />}
        topBanners={
          <>
            <PwaInstallPrompt tenantSlug={tenantSlug} variant="banner" />
            <TrialBanner
              daysLeft={trialDaysLeft}
              trialEndsAt={trialEndsAt}
              isGrant={isGrant}
              isExpired={isSubscriptionExpired}
              tier={tenantFeatureFlags?.tier}
              onUpgrade={handleUpgradeTier}
            />
            {isTrialActive && !isGrant && (
              <div className="w-full max-w-[1400px] mx-auto px-6 pt-4 pb-0">
                <TrialQuotaProgressBar
                  tenantSlug={tenantSlug}
                  onUpgradeClick={() => handleUpgradeTier('ads_performance')}
                />
              </div>
            )}
          </>
        }
        asideSlot={
          isPreviewEnabledTab ? (
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
          ) : null
        }
      >
        <ErrorBoundary key={activeTab} name={`DashboardTab:${activeTab}`}>
          {/* TAB 0: DASHBOARD UTAMA (ONBOARDING, ANALYTICS, INTEGRATED STOREFRONT HUB) */}
      {(activeTab === 'dashboard' || activeTab === 'overview') && (
        <DashboardOverviewTab
          tenantSlug={tenantSlug}
          customDomain={customDomain}
          displayName={displayName}
          storeDisplayName={storeDisplayName}
          storeBio={storeBio}
          storeLogoUrl={storeLogoUrl}
          storeQrisUrl={storeQrisUrl}
          waStatus={waStatus}
          connectedPhone={connectedPhone}
          products={products}
          transactions={Array.isArray(orders) && orders.length > 0 ? orders : transactions}
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
          onApplyPitch={(patch) => {
            setProductForm((prev) => ({ ...prev, ...patch }));
          }}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onSavedFeedback={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* TAB 1: LIVE CHAT CS OMNICHANNEL */}
      {activeTab === 'inbox' && (
        isCheckoutLite ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <FeatureLockedTeaser
              featureTitle="BoonTrack Omnichannel Inbox & Meta CAPI"
              badgeTier="Starter / Pro"
              headline="Ubah Chat CS Jadi Sinyal ROAS Meta Ads Secara Real-Time"
              comparison={{
                problemTitle: 'Tantangan Saat Ini',
                problem: 'Chat WhatsApp sering putus dari pelacakan Meta Ads. Konversi closing tidak terbaca algoritma, membuat biaya iklan membengkak tanpa arah.',
                solutionTitle: 'Solusi BoonTrack',
                solution: 'Setiap transaksi closing di chat langsung menembakkan server-side CAPI event. ROAS tercatat akurat dan optimasi iklan menjadi presisi.',
              }}
              bullets={[
                'Otomatis Kirim Event CAPI: Setiap closing di inbox langsung tercatat sebagai Purchase ke Meta Ads tanpa bocor cookie.',
                'Customer Memory: CS selalu tahu histori belanja, tag, dan preferensi pelanggan tanpa tanya ulang.',
                'Multi-CS Satu Nomor: Pantau kinerja seluruh admin dalam satu meja kerja terpusat.',
              ]}
              ctaText="Buka Akses Inbox & Maksimalkan Iklan"
              featureIcon={<MessageSquare className="w-7 h-7 text-indigo-400" />}
              tenantSlug={tenantSlug}
              onUpgrade={() => handleUpgradeTier('ads_performance')}
            />
          </div>
        ) : (
          <TeamChatTab
            initialTenant={tenantData}
            tenantSlug={tenantSlug}
            tenantId={tenantId || undefined}
            isCheckoutLite={isCheckoutLite}
            tenantTier={tenantFeatureFlags?.tier || (isCheckoutLite ? 'CHECKOUT_LITE' : isSoloOrTrial ? 'STARTER' : isAdsPerformance ? 'ADS_PERFORMANCE' : isTeamScale ? 'TEAM_SCALE' : 'STARTER')}
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
            isTenantBotPaused={isTenantBotPaused}
            handleToggleTenantBot={handleToggleTenantBot}
            onOpenCustomers={() => setActiveTab('customers')}
          />
        )
      )}

      {/* TAB PELANGGAN (CRM): Customer Database Table View */}
      {(activeTab === 'customers' || activeTab === 'crm') && (
        !isCrmEnabled ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <FeatureLockedTeaser
              featureTitle="WhatsApp Commerce CRM Terintegrasi"
              badgeTier="Eksklusif Paket Team Scale"
              headline="Database Pembeli Otomatis, Tagging & Manajemen Follow-up Pelanggan"
              comparison={{
                problemTitle: 'Masalah: CS Lupa Histori & Chat Acak-acakan',
                problem:
                  'CS sering lupa riwayat belanja, preferensi, dan keluhan pelanggan terdahulu. Chat acak-acakan tanpa histori membuat closing lambat dan pelanggan frustrasi.',
                solutionTitle: 'Solusi: Memory Layer & Lifecycle CRM BoonTrack',
                solution:
                  'Memory layer merekam interaksi, tag relasional, catatan internal rahasia CS, dan tahapan lifecycle otomatis tepat di samping jendela obrolan.',
              }}
              bullets={[
                'Database Pembeli Otomatis: CS selalu tahu histori belanja, tag, dan preferensi pelanggan tanpa tanya ulang.',
                'Lifecycle Stage Engine: Pantau alur prospek (LEAD → QUALIFIED → CUSTOMER → REPEAT_CUSTOMER) secara visual.',
                'Internal Team Notes & Broadcast Follow-up: Kolaborasi catatan rahasia dan operasional follow-up pelanggan.',
              ]}
              calloutBanner="💡 Fitur Eksklusif Paket Team Scale: Buka modul CRM terintegrasi bersama Multi-CS & Broadcast WA!"
              ctaText="Upgrade ke Team Scale"
              featureIcon={<Brain className="w-7 h-7 text-indigo-400" />}
              tenantSlug={tenantSlug}
              onUpgrade={() => handleUpgradeTier('team_scale')}
            />
          </div>
        ) : (
          <CustomerDatabaseTab
            tenantSlug={tenantSlug}
            tenantId={tenantId}
            isCrmEnabled={isCrmEnabled}
            onOpenInbox={(phone?: string) => {
              if (phone) {
                const cleanPhone = phone.replace(/\D/g, '');
                const match = conversations.find(
                  (c) => (c.customerPhone || '').replace(/\D/g, '') === cleanPhone
                );
                if (match) {
                  setActiveConversationId(match.id);
                }
              }
              setActiveTab('inbox');
            }}
          />
        )
      )}

      {/* TAB: PESANAN / ORDERS */}
      {activeTab === 'orders' && (
        <OrdersTab
          tenantSlug={tenantSlug}
          storeDisplayName={storeDisplayName || displayName || tenantSlug}
          storePhone={storeWhatsapp || undefined}
          storeCity={undefined}
          orders={orders}
          onOrdersSynced={(syncedOrders) => {
            setOrders(syncedOrders);
          }}
          onOrderUpdated={(updated) => {
            setOrders((prev: any[]) =>
              Array.isArray(prev)
                ? prev.map((o: any) => {
                    const id = String(o.order_id || o.id || o.invoice_no || '');
                    if (id === updated.id || o.invoice_no === updated.invoice_no) {
                      return {
                        ...o,
                        ...updated,
                        status: updated.status,
                        payment_status: updated.payment_status,
                      };
                    }
                    return o;
                  })
                : []
            );
          }}
        />
      )}

      {/* TAB 2: KATALOG MULTI-PRODUK */}
      {(activeTab === 'catalog' || activeTab === 'products') && (
        <ProductsTab
          products={products}
          tenantSlug={tenantSlug}
          customDomain={customDomain}
          isSubscriptionExpired={isSubscriptionExpired}
          onUpgrade={() => handleUpgradeTier('ads_performance')}
          openNewProductModal={openNewProductModal}
          openEditProductModal={openEditProductModal}
          handleDeleteProduct={handleDeleteProduct}
          handleQuickStockChange={handleQuickStockChange}
          handleToggleProductActive={handleToggleProductActive}
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
          customDomain={customDomain}
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
        <ThemeTab
          tenantSlug={tenantSlug}
          displayName={displayName}
          storeDisplayName={storeDisplayName}
          storeBio={storeBio}
          storeLogoUrl={storeLogoUrl}
          storeWhatsapp={storeWhatsapp}
          products={products}
          isTeamScale={isTeamScale}
          isAdsPerformance={isAdsPerformance}
          isSubscriptionExpired={isSubscriptionExpired}
          onUpgrade={() => handleUpgradeTier('ads_performance')}
          currentVisualTheme={activeVisualTheme}
          initialButtons={livePreviewButtons}
          featuredProductIds={livePreviewFeaturedProductIds}
          showProducts={livePreviewShowProducts}
          onShowProductsChange={(show) => setLivePreviewShowProducts(show)}
          onThemeChange={handleThemeChange}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3500);
          }}
          customDomain={customDomain}
          isCheckoutLite={isCheckoutLite}
        />
      )}

      {/* TAB 3: AI Knowledge */}
      {activeTab === 'ai_knowledge' && (
        !isAiBotAllowed ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <FeatureLockedTeaser
              featureTitle="Smart Chatbox AI (BoonPilot)"
              badgeTier="Eksklusif Ads Performance & Team Scale"
              headline="Asisten Bot Otomatis untuk Katalog, Cek Ongkir, & Kualifikasi Leads 24/7"
              comparison={{
                problemTitle: 'Masalah: Respon Lambat & Kehilangan Pembeli Malam Hari',
                problem:
                  'Calon pembeli sering chat di luar jam kerja. Menunggu balasan manual membuat prospek dingin dan beralih ke toko kompetitor.',
                solutionTitle: 'Solusi: BoonPilot Smart Chatbox AI',
                solution:
                  'BoonPilot otomatis melayani pembeli, mengecek ongkir ekspedisi, merekomendasikan produk relevan, dan mengkualifikasi leads secara cerdas 24/7.',
              }}
              bullets={[
                'Smart Chatbox AI (BoonPilot): Asisten bot otomatis untuk katalog, cek ongkir, & kualifikasi leads otomatis 24/7.',
                'Product Knowledge Grounding: Dilatih otomatis dari katalog produk dan informasi toko Anda.',
                'Seamless CS Handoff: Mengalihkan obrolan kompleks ke admin CS manusia dengan ringkasan konteks.',
              ]}
              calloutBanner="💡 Fitur Eksklusif Paket Ads Performance & Team Scale: Buka modul Smart Chatbox AI untuk melipatgandakan konversi!"
              ctaText="Upgrade ke Ads Performance"
              featureIcon={<Sparkles className="w-7 h-7 text-indigo-400" />}
              tenantSlug={tenantSlug}
              onUpgrade={() => handleUpgradeTier('ads_performance')}
            />
          </div>
        ) : (
          <AiKnowledgeTab
            tenantSlug={tenantSlug}
            tenant={tenant}
            aiForm={aiForm}
            setAiForm={setAiForm}
            greetingMessage={greetingMessage}
            setGreetingMessage={setGreetingMessage}
            salesPolicy={salesPolicy}
            setSalesPolicy={setSalesPolicy}
            faqs={faqs}
            setFaqs={setFaqs}
            interactiveMenus={interactiveMenus}
            setInteractiveMenus={setInteractiveMenus}
            botMode={botMode}
            setBotMode={setBotMode}
            handleSaveAiKnowledge={handleSaveAiKnowledge}
            isSavingAi={isSavingAi}
            isLoadingAi={isLoadingAi}
            isSimulatorOpen={isSimulatorOpen}
            setIsSimulatorOpen={setIsSimulatorOpen}
            storeCategory={storeCategory}
            saveFeedback={saveFeedback}
          />
        )
      )}

      {/* TAB: LAPORAN & KEUANGAN */}
      {(activeTab === 'finance' || activeTab === 'integration' || activeTab === 'analytics') && (
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
            displayName={displayName}
            transactions={transactions && transactions.length > 0 ? transactions : orders}
            isWithdrawModalOpen={isWithdrawModalOpen}
            setIsWithdrawModalOpen={setIsWithdrawModalOpen}
            withdrawAmount={withdrawAmount}
            setWithdrawAmount={setWithdrawAmount}
            handleProcessWithdraw={handleProcessWithdraw}
            isWithdrawing={isWithdrawing}
            tenantSlug={tenantSlug}
            onOrderUpdated={(updated) => {
              setOrders((prev: any[]) =>
                Array.isArray(prev)
                  ? prev.map((o: any) => {
                      const id = String(o.order_id || o.id || o.invoice_no || '');
                      if (id === updated.id || o.invoice_no === updated.invoice_no) {
                        return { ...o, ...updated };
                      }
                      return o;
                    })
                  : []
              );
            }}
          />
        )
      )}

      {/* TAB: SETTINGS & PROFIL TOKO */}
      {activeTab === 'settings' && (
        <SettingsTab
          tenantSlug={tenantSlug}
          customDomain={customDomain}
          storeDisplayName={storeDisplayName}
          setStoreDisplayName={setStoreDisplayName}
          storeBio={storeBio}
          setStoreBio={setStoreBio}
          storeWhatsapp={storeWhatsapp}
          setStoreWhatsapp={setStoreWhatsapp}
          storeGreetingMessage={storeGreetingMessage}
          setStoreGreetingMessage={setStoreGreetingMessage}
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
          isSubscriptionExpired={isSubscriptionExpired}
          onUpgrade={() => handleUpgradeTier('ads_performance')}
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
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-2.5 flex items-center justify-between gap-3 overflow-x-auto">
            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 items-center">
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'whatsapp'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Koneksi Gateway & Bot
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('auto_reply')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'auto_reply'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Aturan Auto-Reply (Keyword)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('broadcast')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'broadcast'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Broadcast WA Massal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rotator')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'rotator'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>🔄 CS / WhatsApp Rotator</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
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
              qrImgError={qrImgError}
              setQrImgError={setQrImgError}
              isQrLoading={isQrLoading}
              waLoadingMessage={waLoadingMessage}
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
              isTeamScale={isTeamScale}
              renderLockedFeatureCard={renderLockedFeatureCard}
              onUpgradeTier={handleUpgradeTier}
              setSaveFeedback={setSaveFeedback}
              greetingMessage={storeGreetingMessage}
              setGreetingMessage={setStoreGreetingMessage}
              handleSaveGreetingMessage={handleSaveGreetingMessage}
              isSavingGreeting={isSavingGreeting}
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
              <div className="p-6 md:p-8 max-w-5xl mx-auto w-full flex items-center justify-center">
                <FeatureLockedTeaser
                  featureTitle="WhatsApp Business API (Official WABA)"
                  badgeTier="Team Scale"
                  headline="Broadcast Skala Besar & Automasi Resmi Meta Tanpa Risiko Terblokir"
                  comparison={{
                    problemTitle: 'Tantangan Saat Ini',
                    problem: 'Broadcast manual dari nomor pribadi rentan terblokir (banned) seketika oleh WhatsApp dan membatasi skala pertumbuhan bisnis.',
                    solutionTitle: 'Solusi BoonTrack',
                    solution: 'Jalur resmi Meta Cloud API dengan centang hijau, proteksi anti-banned mutlak, dan kecepatan kirim ribuan pesan per menit.',
                  }}
                  bullets={[
                    'Broadcast Massal Resmi: Kirim promosi serentak ke ribuan kontak pelanggan tanpa rasa was-was akun terblokir.',
                    'Centang Hijau Resmi (OBA): Bangun kredibilitas instan dengan verified business badge di profil WhatsApp.',
                    'Template Interaktif Meta: Kirim penawaran dengan tombol Quick Reply & CTA link langsung ke pembayaran.',
                  ]}
                  ctaText="Upgrade ke Team Scale (Official WABA)"
                  featureIcon={<Radio className="w-7 h-7 text-emerald-400" />}
                  tenantSlug={tenantSlug}
                  onUpgrade={() => handleUpgradeTier('team_scale')}
                />
              </div>
            ) : (
              <WhatsAppBroadcastManager
                tenantSlug={tenantSlug}
                tenantId={tenantId}
                displayName={displayName}
                onSaved={(msg) => {
                  setSaveFeedback(msg);
                  setTimeout(() => setSaveFeedback(null), 4000);
                }}
              />
            ))}

        </div>
      )}

      {/* TAB: NOTIFIKASI TELEGRAM MULTI-TENANT */}
      {activeTab === 'telegram_alerts' && (
        <TelegramAlertManager
          tenantSlug={tenantSlug}
          displayName={displayName}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 4000);
          }}
        />
      )}

      {/* TAB: ADS TRACKING PRO & CAPI */}
      {activeTab === 'ads_tracking' && (
        <AdsTrackingTab
          isAdsTrackingUnlocked={isAdsTrackingUnlocked}
          isCheckoutLite={isCheckoutLite}
          isSoloOrTrial={isSoloOrTrial}
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

      {/* TAB: PENGIRIMAN & EKSPEDISI MULTI-KURIR (HANYA PRODUK FISIK / FNB) */}
      {(activeTab === 'shipping' || activeTab === 'biteship') && (() => {
        const isFnbCatering =
          resolveDomainVertical(storeCategory || businessType) === 'fnb-culinary' ||
          tenantData?.metadata?.fnb_catering === true;

        return isFnbCatering ? (
          <>
            {/* FnB: Konfigurasi Titik Dapur, Alur Logistik & Driver Toko */}
            <FnbInstantCourier tenantSlug={tenantSlug} />
            {/* FnB: Modul Ambil Sendiri di Toko / Self-Pickup */}
            <BiteshipCourierConfig
              tenantSlug={tenantSlug}
              displayName={displayName}
              isFnbCatering={true}
              onSaved={(msg) => {
                setSaveFeedback(msg);
                setTimeout(() => setSaveFeedback(null), 3000);
              }}
            />
          </>
        ) : (
          <BiteshipCourierConfig
            tenantSlug={tenantSlug}
            displayName={displayName}
            isFnbCatering={false}
            onSaved={(msg) => {
              setSaveFeedback(msg);
              setTimeout(() => setSaveFeedback(null), 3000);
            }}
          />
        );
      })()}

      {/* TAB: BOOKING & JADWAL (FIELD SERVICE / JASA / PRO SERVICE) */}
      {activeTab === 'booking' && (
        resolveDomainVertical(storeCategory || businessType) === 'pro-service' ? (
          <ProServiceCalendarTab tenantSlug={tenantSlug} />
        ) : (
          <FieldServiceBookingTab tenantSlug={tenantSlug} />
        )
      )}

      {/* TAB: AKSES UNDUH & DIGITAL DELIVERY (PRODUK DIGITAL) */}
      {activeTab === 'downloads' && (
        <DigitalDeliveryTab tenantSlug={tenantSlug} />
      )}

      {/* TAB: MANAJEMEN KAMPANYE & UGC (CREATOR AGENCY) */}
      {activeTab === 'campaigns' && (
        <CreatorAgencyCampaignTab tenantSlug={tenantSlug} />
      )}

      {/* TAB: MITRA RESELLER & KOMISI (STORE RESELLER SYSTEM) */}
      {activeTab === 'reseller' && (
        !isResellerFeatureUnlocked ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <FeatureLockedTeaser
              featureTitle="Sistem Reseller & Keagenan Terpusat"
              badgeTier="Eksklusif Paket Team Scale"
              headline="Multi-Tier Harga Agen, Rekap Komisi Otomatis, & Monitoring Penjualan Reseller"
              comparison={{
                problemTitle: 'Masalah: Rekap Komisi Manual & Orderan Berceceran',
                problem:
                  'Mencatat komisi reseller lewat spreadsheet rentan selisih, menyita waktu CS, dan rawan komplain. Reseller sulit memantau performa penjualan mereka sendiri.',
                solutionTitle: 'Solusi: Portal Reseller & Komisi Otomatis BoonTrack',
                solution:
                  'Setiap reseller mendapat kode/link referral otomatis, komisi dihitung per transaksi berhasil, dan monitoring penjualan reseller real-time.',
              }}
              bullets={[
                'Sistem Reseller & Keagenan Terpusat: Multi-tier harga agen, rekap komisi otomatis, & monitoring penjualan reseller.',
                'Pelacakan referral non-kustodial berbasis parameter link (?r=KODE).',
                'Rekap komisi otomatis & riwayat pencairan transparan.',
              ]}
              calloutBanner="💡 Fitur Eksklusif Paket Team Scale: Buka modul Reseller bersama Official WABA & CRM Terintegrasi!"
              ctaText="Upgrade ke Team Scale"
              featureIcon={<Users className="w-7 h-7 text-purple-400" />}
              tenantSlug={tenantSlug}
              onUpgrade={() => handleUpgradeTier('team_scale')}
            />
          </div>
        ) : (
          <ResellerTab tenantSlug={tenantSlug} tenantData={tenantData} />
        )
      )}

      {/* TAB: DOKUMENTASI & PANDUAN INTEGRASI (IN-DASHBOARD TAB) */}
      {(activeTab === 'docs' || activeTab === 'documentation') && (
        <DocumentationTab
          tenant={tenant}
          tenantSlug={tenantSlug}
          displayName={storeDisplayName || displayName}
          onNavigateTab={(tab) => setActiveTab(tab as any)}
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
            </ErrorBoundary>
      </DashboardShell>

      {/* BOONPILOT AI COPILOT DRAWER (FAB disembunyikan — dipicu via Topbar event 'open-boonpilot') */}
      <div className="[&>div>button]:hidden!">
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
          subscriptionPlan={tenant.tier}
          isAiBotAllowed={Boolean(isAiBotAllowed)}
          isCheckoutLite={Boolean(isCheckoutLite)}
          onUpgrade={(tier) => handleUpgradeTier((tier as any) || 'ads_performance')}
        />
      </div>

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
        customDomain={customDomain}
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
        isSaving={isSavingSinglePage}
      />

      {/* MODAL EDIT PROFIL TOKO */}
      {isStoreSettingsOpen && (
        <SettingsTab
          tenantSlug={tenantSlug}
          customDomain={customDomain}
          storeDisplayName={storeDisplayName}
          setStoreDisplayName={setStoreDisplayName}
          storeBio={storeBio}
          setStoreBio={setStoreBio}
          storeWhatsapp={storeWhatsapp}
          setStoreWhatsapp={setStoreWhatsapp}
          storeGreetingMessage={storeGreetingMessage}
          setStoreGreetingMessage={setStoreGreetingMessage}
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
          isSubscriptionExpired={isSubscriptionExpired}
          onUpgrade={() => handleUpgradeTier('ads_performance')}
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
    </>
  );
}