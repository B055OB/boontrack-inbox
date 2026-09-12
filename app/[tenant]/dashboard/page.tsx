'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Store,
  ExternalLink,
  Calendar,
  Download,
} from 'lucide-react';
import LockedFeatureCard from './components/LockedFeatureCard';

import NavTabs from './components/navbar/NavTabs';
import OrderNotificationBell from './components/navbar/OrderNotificationBell';
import TrialBanner from './components/navbar/TrialBanner';
import ProductsTab from './components/tabs/ProductsTab';
import AdsTrackingTab from './components/tabs/AdsTrackingTab';
import TeamChatTab from './components/tabs/TeamChatTab';
import OverviewTab from './components/tabs/OverviewTab';
import SettingsTab from './components/tabs/SettingsTab';
import MicrositeTab from './components/tabs/MicrositeTab';
import WhatsAppTab from './components/tabs/WhatsAppTab';
import AiKnowledgeTab from './components/AiKnowledgeTab';
import BiteshipCourierConfig from './components/BiteshipCourierConfig';
import WhatsAppBroadcastManager from './components/WhatsAppBroadcastManager';
import BoonPilotWidget from '@/components/BoonPilotWidget';
import StoreBioLinkWidget from './components/StoreBioLinkWidget';
import ProductFormModal from './components/ProductFormModal';
import SinglePageBuilderModal from './components/SinglePageBuilderModal';
import BulkImportModal from './components/modals/BulkImportModal';
import UpsellModal from './components/modals/UpsellModal';
import UpgradePaymentModal from './components/modals/UpgradePaymentModal';
import LocalServiceConfigForm from '@/app/components/LocalServiceConfigForm';
import {
  ModularVerticalTabDispatcher,
  ModularAiKnowledgeDispatcher,
  resolveDomainVertical,
} from './components/modules';
import { useTenantDashboard } from './hooks/useTenantDashboard';

const OrdersTab = dynamic(() => import('./components/tabs/OrdersTab'), {
  loading: () => <div className="p-8 text-center text-xs text-slate-400">Memuat Pesanan...</div>,
});

export default function TenantDashboardPage() {
  const {
    tenantSlug,
    displayName,
    isTeamScale,
    isAdsPerformance,
    isProScale,
    isGrowthPlus,
    isGrowth,
    isAdsTrackingUnlocked,
    isSoloOrTrial,
    handleUpgradeTier,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    targetUpgradeTier,
    openUpgradeModal,

    trialDaysLeft,
    tenantFeatureFlags,
    isAiBotAllowed,
    isUpsellModalOpen,
    setIsUpsellModalOpen,

    storeCategory,
    storeDisplayName,
    setStoreDisplayName,
    storeBio,
    setStoreBio,
    storeWhatsapp,
    setStoreWhatsapp,
    nameError,
    setNameError,
    storeQrisUrl,
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
    qrCodeUrl,
    setQrCodeUrl,
    isQrLoading,
    waErrorMessage,
    connectedPhone,
    setConnectedPhone,
    pairingPhone,
    setPairingPhone,
    pairingCodeResult,
    isPairingLoading,
    handleConnectGrowthSession,
    handleRequestPairingCode,

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

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
      {/* STICKY TOP WRAPPER (HEADER + TABS NAVIGATION) */}
      <div className="sticky top-0 z-50 isolate bg-white border-b border-slate-200 shadow-xs">
        {/* TOP NAVBAR */}
        <header className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link
              href={`/${tenantSlug}`}
              target="_blank"
              className="text-xs font-bold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-slate-200 transition inline-flex items-center gap-1.5 shadow-xs shrink-0"
            >
              <Store className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Lihat Etalase Toko</span>
              <span className="sm:hidden">Toko</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </Link>
            <OrderNotificationBell tenantSlug={tenantSlug} />

            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setNameError(null);
                  setIsStoreSettingsOpen(true);
                }}
                className="group flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer text-left"
                title="Klik untuk ubah nama & profil toko"
              >
                <span className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider truncate group-hover:text-blue-600">
                  {storeDisplayName || displayName}
                </span>
                <span className="text-[11px] text-slate-400 group-hover:text-blue-600">
                  ✏️
                </span>
              </button>
              <span
                className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md border shrink-0 ${
                  isTeamScale
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : isAdsPerformance
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {isTeamScale ? 'Team Scale' : isAdsPerformance ? 'Ads Performance' : 'Solo'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5 text-[11px] sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">Storefront Active</span>
              <span className="sm:hidden">Online</span>
            </span>
          </div>
        </header>

        {/* REVERSE TRIAL WARNING BANNER */}
        <TrialBanner
          daysLeft={trialDaysLeft}
          tier={tenantFeatureFlags?.tier}
          onUpgrade={handleUpgradeTier}
        />

        {/* TABS NAVIGATION */}
        <NavTabs
          activeTab={activeTab as any}
          setActiveTab={setActiveTab as any}
          isTeamScale={isTeamScale}
          isAdsPerformance={isAdsPerformance}
          isAdsTrackingUnlocked={isAdsTrackingUnlocked}
          isSoloOrTrial={isSoloOrTrial}
          storeCategory={storeCategory}
          productCount={products.length}
          orderCount={transactions.length}
        />

        {saveFeedback && (
          <div className="hidden md:block text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            {saveFeedback}
          </div>
        )}
      </div>

      {/* SHORTLINK BIO TOKO WIDGET */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-5 -mb-2 sm:-mb-3">
        <StoreBioLinkWidget tenantSlug={tenantSlug} />
      </div>

      {/* TAB 1: LIVE CHAT CS OMNICHANNEL */}
      {activeTab === 'inbox' && (
        <TeamChatTab
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
        />
      )}

      {/* TAB: PESANAN / ORDERS */}
      {activeTab === 'orders' && <OrdersTab tenantSlug={tenantSlug} />}

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
        />
      )}

      {/* TAB: TAMPILAN & MICROSITE */}
      {(activeTab === 'microsite' || activeTab === 'storefront') && (
        <MicrositeTab
          tenantSlug={tenantSlug}
          displayName={displayName}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
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
            transactions={transactions}
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
          handleQrisUpload={handleQrisUpload}
          isUploadingQris={isUploadingQris}
          nameError={nameError}
          setNameError={setNameError}
          isTeamScale={isTeamScale}
          isModal={false}
          onSavedSuccess={() => {
            setSaveFeedback('Profil toko berhasil disimpan.');
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
      )}

      {/* TAB 5: WHATSAPP & BROADCAST UNIFIED HUB */}
      {(activeTab === 'whatsapp' || activeTab === 'broadcast') && (
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
                onClick={() => setActiveTab('broadcast')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'broadcast'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Broadcast WA Massal
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
              qrCodeUrl={qrCodeUrl}
              setQrCodeUrl={setQrCodeUrl}
              isQrLoading={isQrLoading}
              waErrorMessage={waErrorMessage}
              connectedPhone={connectedPhone}
              setConnectedPhone={setConnectedPhone}
              pairingPhone={pairingPhone}
              setPairingPhone={setPairingPhone}
              pairingCodeResult={pairingCodeResult}
              isPairingLoading={isPairingLoading}
              handleConnectGrowthSession={handleConnectGrowthSession}
              handleRequestPairingCode={handleRequestPairingCode}
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
        <BiteshipCourierConfig
          tenantSlug={tenantSlug}
          displayName={displayName}
          onSaved={(msg) => {
            setSaveFeedback(msg);
            setTimeout(() => setSaveFeedback(null), 3000);
          }}
        />
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

      {/* BOONPILOT AI COPILOT FLOATING WIDGET */}
      <BoonPilotWidget
        tenantSlug={tenantSlug}
        storeCategory={storeCategory}
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
          handleQrisUpload={handleQrisUpload}
          isUploadingQris={isUploadingQris}
          storeLogoUrl={storeLogoUrl}
          handleLogoUpload={handleLogoUpload}
          isUploadingLogo={isUploadingLogo}
          nameError={nameError}
          setNameError={setNameError}
          isTeamScale={isTeamScale}
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

      {/* MODAL PEMBAYARAN UPGRADE LANGSUNG (QRIS) */}
      <UpgradePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        tenantSlug={tenantSlug}
        displayName={displayName}
        targetTier={targetUpgradeTier}
      />
    </main>
  );
}