'use client';

// Hook: useTenantDashboard - Dynamic synchronization for orders, transactions, and WhatsApp inbox sessions

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBackendApiUrl } from '@/lib/api-config';
import { getPlatformWhatsApp } from '@/lib/tenant-config';
import {
  ProductItem,
  ProductType,
  SinglePageConfig,
  VoucherConfig,
  TransactionItem,
  slugify,
  resolveFulfillmentRequirements,
  mapToDbProductType,
  sanitizeProductPayload,
  safeJsonStringify,
} from '@/lib/product-catalog';
import { mapBusinessCategoryToProductType } from '../components/ProductFormModal';
import { getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { optimizeImageToWebP } from '@/components/ImageUpload';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import { mapProposalToAiForm } from '@/lib/boonpilotMapper';
import { sanitizeImageUrl, uploadImageFile } from '@/lib/image-utils';
import type { InteractiveMenu } from '@/lib/whatsappFormatter';
import { getRemainingDays } from '@/lib/subscription-tiers';
import {
  calculateFinancialMetrics,
  fetchTenantOrdersAgnostic,
} from '@/lib/finance-engine';

export type DashboardTab =
  | 'dashboard'
  | 'overview'
  | 'inbox'
  | 'catalog'
  | 'products'
  | 'orders'
  | 'microsite'
  | 'links'
  | 'storefront'
  | 'themes'
  | 'finance'
  | 'ai_knowledge'
  | 'integration'
  | 'analytics'
  | 'ads_tracking'
  | 'biteship'
  | 'shipping'
  | 'booking'
  | 'downloads'
  | 'campaigns'
  | 'broadcast'
  | 'whatsapp'
  | 'auto_reply'
  | 'rotator'
  | 'telegram_alerts'
  | 'crm'
  | 'customers'
  | 'reseller'
  | 'docs'
  | 'documentation'
  | 'settings';

export interface ConversationMessage {
  id: number | string;
  sender: 'customer' | 'agent' | 'bot' | 'system' | string;
  senderName?: string;
  text: string;
  time: string;
  isQris?: boolean;
  qrisData?: any;
  isBankTransfer?: boolean;
  bankData?: any;
  isLocation?: boolean;
  locationData?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    distanceKm?: number;
    rates?: any[];
  };
}

export interface ChatConversation {
  id: string;
  customerPhone: string;
  customerName?: string;
  avatarInitials?: string;
  lastMessage: string;
  time: string;
  status: 'online' | 'offline';
  assignedTo?: 'my_chat' | 'unassigned' | string;
  assignedAgentName?: string;
  isBotActive?: boolean;
  tag?: string;
  unreadCount?: number;
  crm?: any;
  messages: ConversationMessage[];
}

export function useTenantDashboard() {
  const params = useParams();
  const router = useRouter();
  const rawTenant = (params?.tenant as string) || '';
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, ' ');

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Dynamic Vertical Category
  const [storeCategory, setStoreCategory] = useState<string>('PHYSICAL');
  const [capabilities, setCapabilities] = useState<{
    shipping?: boolean;
    booking?: boolean;
    digital_fulfillment?: boolean;
    [key: string]: any;
  } | null>(null);

  // Feature flags resolved from settings API response
  const [tenantFeatureFlags, setTenantFeatureFlags] = useState<{
    has_capi?: boolean;
    ads_tracking?: boolean;
    tier?: string;
  }>({});

  // Selected plan from tenant metadata (Single Source of Truth)
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // Reverse Trial Days Left & End Date
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);
  const [tenantMetaOmzet, setTenantMetaOmzet] = useState<number>(0);

  // Subscription Special Grant State
  const [isGrant, setIsGrant] = useState<boolean>(false);
  const [grantValidUntil, setGrantValidUntil] = useState<string | null>(null);
  const [grantDaysLeft, setGrantDaysLeft] = useState<number | null>(null);

  // Upsell Modal State for Locked Features
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);

  // Plan Tier
  const [planTier, setPlanTier] = useState<'growth' | 'ads_performance' | 'team_scale'>('growth');
  const [isUrlCheckoutLite, setIsUrlCheckoutLite] = useState(false);

  const cleanSelectedPlan = String(selectedPlan || '').toLowerCase();
  const cleanTierUpper = String(tenantFeatureFlags.tier || '').toUpperCase();
  const cleanTierLower = cleanTierUpper.toLowerCase();

  const isCheckoutLite =
    cleanTierUpper === 'CHECKOUT_LITE' ||
    cleanSelectedPlan.includes('checkout') ||
    isUrlCheckoutLite;

  // Team Scale — DB canonical: 'ENTERPRISE' (ARCHITECTURE.md ADR)
  // Backward-compat aliases: 'TEAM_SCALE'
  const isTeamScale =
    !isCheckoutLite &&
    (planTier === 'team_scale' ||
      cleanTierUpper === 'ENTERPRISE' ||
      cleanTierUpper === 'TEAM_SCALE' ||
      cleanSelectedPlan.includes('enterprise') ||
      cleanSelectedPlan.includes('team'));

  // Ads Performance — DB canonical: 'PRO_SCALE' (ARCHITECTURE.md ADR)
  // Backward-compat aliases: 'ADS_PERFORMANCE', 'GROWTH_PLUS'
  // Tier Hierarchy: Team Scale / Enterprise automatically inherits Ads Performance capabilities
  const isAdsPerformance =
    !isCheckoutLite &&
    (isTeamScale ||
      planTier === 'ads_performance' ||
      cleanTierUpper === 'PRO_SCALE' ||
      cleanTierUpper === 'ADS_PERFORMANCE' ||
      cleanTierUpper === 'GROWTH_PLUS' ||
      cleanTierUpper.includes('ADS') ||
      cleanSelectedPlan.includes('ads') ||
      cleanSelectedPlan.includes('performance'));

  const isProScale = isAdsPerformance;
  const isGrowthPlus = isAdsPerformance;
  const isGrowth = !isCheckoutLite && planTier === 'growth' && !isAdsPerformance && !isTeamScale;

  // Solo/Starter — DB canonical: 'STARTER' (ARCHITECTURE.md ADR)
  // Backward-compat aliases: 'SOLO', 'SOLO_TRIAL'
  const isSoloOrTrial = Boolean(
    !isTeamScale &&
    !isAdsPerformance &&
    (isCheckoutLite ||
      tenantFeatureFlags.tier === 'STARTER' ||
      tenantFeatureFlags.tier === 'SOLO' ||
      tenantFeatureFlags.tier === 'SOLO_TRIAL' ||
      cleanSelectedPlan.includes('solo') ||
      cleanSelectedPlan.includes('starter') ||
      (cleanTierLower.includes('trial') && !cleanTierLower.includes('ads') && !cleanSelectedPlan.includes('ads')) ||
      isGrowth)
  );

  const isAdsTrackingUnlocked = !isCheckoutLite && (
    (isGrant && (isAdsPerformance || isTeamScale)) ||
    (!isSoloOrTrial && Boolean(
      isAdsPerformance ||
      isTeamScale ||
      tenantFeatureFlags.tier === 'PRO_SCALE' ||
      tenantFeatureFlags.tier === 'ADS_PERFORMANCE' ||
      tenantFeatureFlags.tier === 'ENTERPRISE' ||
      tenantFeatureFlags.tier === 'TEAM_SCALE'
    ))
  );

  const isBroadcastUnlocked = !isCheckoutLite && isTeamScale;

  const isAiBotAllowed =
    !isCheckoutLite &&
    Boolean(isAdsPerformance || isTeamScale);

  const isSubscriptionExpired = Boolean(
    !isGrant && (
      isSuspended ||
      subscriptionStatus === 'expired' ||
      subscriptionStatus === 'suspended' ||
      (trialEndsAt && new Date(trialEndsAt).getTime() <= Date.now()) ||
      (trialDaysLeft !== null && trialDaysLeft <= 0 && Boolean(trialEndsAt || selectedPlan.toLowerCase().includes('trial') || String(tenantFeatureFlags.tier || '').toLowerCase().includes('trial')))
    )
  );

  const isTrialActive = !isGrant && !isSubscriptionExpired && Boolean(
    trialEndsAt ||
    (trialDaysLeft !== null && trialDaysLeft > 0) ||
    String(tenantFeatureFlags.tier || '').toLowerCase().includes('trial') ||
    selectedPlan.toLowerCase().includes('trial') ||
    (isAdsPerformance && Boolean(trialEndsAt || (trialDaysLeft !== null && trialDaysLeft > 0)))
  );

  // Standarisasi UI Dashboard: Label di bawah nama toko berdasarkan metadata.selected_plan
  // Fallback ke resolusi tier jika selectedPlan belum tersedia
  const tierLabel = isGrant
    ? (isTeamScale
        ? 'Team Scale • Special Grant'
        : isAdsPerformance
        ? 'Ads Performance • Special Grant'
        : isCheckoutLite
        ? 'Checkout Lite • Special Grant'
        : 'Starter • Special Grant')
    : (selectedPlan ||
      (isCheckoutLite
        ? 'Paket Checkout Lite'
        : isTeamScale
        ? 'Team Scale'
        : isAdsPerformance
        ? (isTrialActive || trialDaysLeft !== null ? 'Ads Performance Trial' : 'Ads Performance')
        : 'Paket Starter'));

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [targetUpgradeTier, setTargetUpgradeTier] = useState<'ads_performance' | 'team_scale' | 'solo' | 'checkout_lite'>('ads_performance');

  const openUpgradeModal = (targetTier: 'ads_performance' | 'team_scale' | 'solo' | 'checkout_lite' = 'ads_performance') => {
    setTargetUpgradeTier(targetTier);
    setIsPaymentModalOpen(true);
  };

  const handleUpgradeTier = (targetTier: 'ads_performance' | 'team_scale' | 'solo' | 'checkout_lite' = 'ads_performance') => {
    openUpgradeModal(targetTier);
  };

  // State Profil Toko
  const [isStoreSettingsOpen, setIsStoreSettingsOpen] = useState(false);
  const [storeDisplayName, setStoreDisplayName] = useState(displayName || '');
  const [storeBio, setStoreBio] = useState('');
  const [storeWhatsapp, setStoreWhatsapp] = useState('');
  const [storeGreetingMessage, setStoreGreetingMessage] = useState<string>('');
  const [isSavingGreeting, setIsSavingGreeting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [storeQrisUrl, setStoreQrisUrl] = useState<string>('');
  const [storeQrisPayload, setStoreQrisPayload] = useState<string>('');
  const [isUploadingQris, setIsUploadingQris] = useState(false);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string>('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<DashboardTab>('dashboard');
  const hasUserSelectedTabRef = useRef(false);
  const [isStoreReadinessEvaluated, setIsStoreReadinessEvaluated] = useState(false);

  // Authentication & Security Guard State (P0 Broken Access Control Remediation)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const checkClientSession = (slug: string): boolean => {
    if (typeof window === 'undefined') return false;
    const clean = slug.toLowerCase().trim();
    try {
      const storedStore = (localStorage.getItem('merchant_store') || '').toLowerCase().trim();
      const storedSession = (localStorage.getItem('merchant_session') || '').toLowerCase().trim();
      const cookies = document.cookie;
      const hasStoreCookie = cookies.split(';').some(c => {
        const parts = c.trim().split('=');
        const k = parts[0]?.trim();
        const v = parts.slice(1).join('=').trim();
        return (k === 'merchant_store' || k === 'merchant_session' || k === 'bt_tenant') &&
               decodeURIComponent(v).toLowerCase().trim() === clean;
      });
      return storedStore === clean || storedSession === clean || hasStoreCookie;
    } catch {
      return false;
    }
  };

  const handleSelectTab = (tab: DashboardTab) => {
    hasUserSelectedTabRef.current = true;
    setActiveTab(tab);
  };

  // WhatsApp Gateway State (Strict Multi-Tenant)
  const [waMode, setWaMode] = useState<'qr' | 'meta'>('qr');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [waLoadingMessage, setWaLoadingMessage] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrImgError, setQrImgError] = useState(false);
  const [waStatus, setWaStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED'>('DISCONNECTED');
  const [waErrorMessage, setWaErrorMessage] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [waProvider, setWaProvider] = useState<'EVOLUTION' | 'WABA'>('EVOLUTION');
  const [waConnectionMode, setWaConnectionMode] = useState<'SHARED' | 'DEDICATED'>('SHARED');

  // Conversations State (Isolated strictly by tenantSlug)
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isTenantBotPaused, setIsTenantBotPaused] = useState<boolean>(false);

  // Products State
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | string | null>(null);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantData, setTenantData] = useState<any>(null);

  // Sync tenant data from SettingsTab custom events
  useEffect(() => {
    const handleTenantUpdated = (e: any) => {
      if (e?.detail) {
        setTenantData((prev: any) => ({
          ...(prev || {}),
          ...e.detail,
          metadata: {
            ...((prev && prev.metadata) || {}),
            ...(e.detail.metadata || {}),
          },
        }));
      }
    };
    window.addEventListener('boontrack:tenant-updated', handleTenantUpdated);
    window.addEventListener('tenant-settings-updated', handleTenantUpdated);
    return () => {
      window.removeEventListener('boontrack:tenant-updated', handleTenantUpdated);
      window.removeEventListener('tenant-settings-updated', handleTenantUpdated);
    };
  }, []);

  // Client-side hydration sync: loads cached localStorage & URL params AFTER mount to guarantee 0 SSR mismatch (#418)
  useEffect(() => {
    if (typeof window === 'undefined' || !tenantSlug) return;

    try {
      const stored = localStorage.getItem(`bt_selected_plan_${tenantSlug}`);
      if (stored) setSelectedPlan(stored);
    } catch (_) {}

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toLowerCase();
      if (tabParam && ['docs', 'documentation', 'inbox', 'orders', 'catalog', 'products', 'whatsapp', 'shipping', 'ads_tracking', 'settings'].includes(tabParam)) {
        setActiveTab(tabParam as DashboardTab);
      }
      const tierParam = urlParams.get('tier')?.toLowerCase();
      if (tierParam) {
        if (tierParam.toUpperCase() === 'CHECKOUT_LITE') {
          setIsUrlCheckoutLite(true);
        }
        if (['ads_performance', 'pro_scale', 'proscale', 'ads', 'performance', 'pro_ads', 'growth_tracking', 'growth+', 'growthplus', 'growth-plus', 'growth_plus', 'tracking'].some(t => tierParam.includes(t))) {
          setPlanTier('ads_performance');
        } else if (['team_scale', 'enterprise'].some(t => tierParam.includes(t)) || (tierParam.includes('scale') && !tierParam.includes('pro'))) {
          setPlanTier('team_scale');
        } else if (['growth', 'starter', 'solo'].some(t => tierParam.includes(t))) {
          setPlanTier('growth');
        }
      } else {
        const storedTier = localStorage.getItem(`bt_tier_${tenantSlug}`) as 'growth' | 'ads_performance' | 'team_scale' | null;
        if (storedTier && ['growth', 'ads_performance', 'team_scale'].includes(storedTier)) {
          setPlanTier(storedTier);
        }
      }
    } catch (_) {}

    // Security & Data Integrity: Clear any legacy mock conversations from localStorage
    try {
      localStorage.removeItem(`bt_conversations_${tenantSlug}`);
    } catch (_) {}

    try {
      const savedProds = localStorage.getItem(`bt_products_${tenantSlug}`);
      if (savedProds) {
        const parsed = JSON.parse(savedProds);
        if (Array.isArray(parsed) && parsed.length > 0) setProducts(parsed);
      }
    } catch (_) {}
  }, [tenantSlug]);

  // Single Page Checkout Builder State
  const [isSinglePageModalOpen, setIsSinglePageModalOpen] = useState(false);
  const [activeSinglePageProduct, setActiveSinglePageProduct] = useState<ProductItem | null>(null);
  const [singlePageForm, setSinglePageForm] = useState<SinglePageConfig>({
    slug: '',
    enable_hero: true,
    enable_client_logos: false,
    enable_problem_solution: true,
    enable_us_vs_them: true,
    enable_testimonials: true,
    enable_offer: true,
    enable_faq: false,
    enable_payment: true,
    enable_custom_html: false,
    custom_html: '',
    headline: '',
    subheadline: '',
    banner_url: '',
    video_url: '',
    gallery_video_url: '',
    limit_single_item: false,
    section_order: [],
    badge_text: 'Direct Access Offer',
    client_logos: [],
    problem_title: 'Apakah Anda Sering Menghadapi Masalah Ini?',
    pain_points: [],
    problem_image_url: '',
    solution_title: 'Kini Hadir Solusi Tepat untuk Anda',
    solution_points: [],
    comparison_rows: [],
    testimonial_images: [],
    testimonials: [],
    bonus_items: [],
    faqs: [],
    enable_qris: true,
    enable_manual_transfer: true,
    discount_coupon: 'HEMAT50',
    affiliate_commission_rate: 0,
  });
  const [isSavingSinglePage, setIsSavingSinglePage] = useState(false);

  const [productForm, setProductForm] = useState<ProductItem>({
    id: 0,
    name: '',
    category: 'Digital',
    price: 99000,
    promo_price: 0,
    variants: 'Format Digital',
    promo: '',
    description: '',
    download_url: '',
    image: '',
    stock: 100,
    sku: 'SKU-001',
    is_unlimited: false,
    checkout_type: 'internal',
    external_url: '',
    cta_label: '',
  });

  // AI & Persona State
  const [aiForm, setAiForm] = useState({
    ai_name: `${(displayName || 'TOKO').toUpperCase()} AI Assistant`,
    tone: 'casual',
    system_prompt: `Anda adalah asisten resmi untuk toko ${(displayName || 'TOKO').toUpperCase()}. Bantu pelanggan mengenai katalog produk, materi, dan transaksi pembayaran QRIS otomatis.`,
  });
  const [greetingMessage, setGreetingMessage] = useState<string>(
    `Halo Kak! Selamat datang di ${(displayName || 'Toko Kami')}. Ada yang bisa kami bantu seputar produk atau pesanan Anda hari ini? 😊`
  );
  const [salesPolicy, setSalesPolicy] = useState({
    price_objection: 'Jelaskan nilai, kualitas bahan, dan garansi resmi tanpa terkesan defensif. Tawarkan bonus atau promo aktif jika tersedia.',
    closing_hook: 'Informasikan batas jam pengiriman hari ini dan kuota promo terbatas untuk memicu transfer / checkout segera.',
    discount_limit: 0,
    handover_trigger: 'hubungi cs, komplain pesanan, bicara dengan admin manusia',
    handover_phone: '',
    custom_do_and_donts: 'Dilarang memberikan nomor kontak pribadi selain nomor resmi toko. Selalu pastikan konfirmasi data penerima sebelum checkout.',
  });
  const [faqs, setFaqs] = useState<Array<{ id: string; question: string; answer: string }>>([]);
  const [interactiveMenus, setInteractiveMenus] = useState<InteractiveMenu[]>([]);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [botStrategy, setBotStrategy] = useState<'trust_builder' | 'balanced' | 'hard_selling'>('trust_builder');
  const [botMode, setBotMode] = useState<'STATIC' | 'HYBRID' | 'AI'>('HYBRID');
  const [isBotActive, setIsBotActive] = useState<boolean>(true);
  const [botPaused, setBotPaused] = useState<boolean>(false);
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);
  const [strategyFeedback, setStrategyFeedback] = useState<string | null>(null);

  // Bank & Transactions State
  const [bankForm, setBankForm] = useState({
    name: '',
    account: '',
    holder: '',
  });
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Auth Redirection
  useEffect(() => {
    if (tenantSlug === 'login' || tenantSlug === 'auth') {
      router.replace('/login');
    }
  }, [tenantSlug, router]);

  // Centralized Upload Handlers
  const handleQrisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantSlug) return;

    if (!file.type.startsWith('image/')) {
      alert('File harus berupa gambar (JPG, PNG, WebP, dll.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(`Ukuran file melebihi 5 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
      return;
    }

    setIsUploadingQris(true);
    try {
      // 1. Auto-decode QR code dari file gambar jika merupakan EMVCo QRIS standar
      let decodedPayload = '';
      if (typeof window !== 'undefined') {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          const tempContainerId = 'temp-qr-decoder-' + Date.now();
          let tempEl = document.getElementById(tempContainerId);
          if (!tempEl) {
            tempEl = document.createElement('div');
            tempEl.id = tempContainerId;
            tempEl.style.display = 'none';
            document.body.appendChild(tempEl);
          }
          const html5QrCode = new Html5Qrcode(tempContainerId, false);
          const scannedText = await html5QrCode.scanFile(file, false);
          try {
            await html5QrCode.clear();
            tempEl.remove();
          } catch {}
          if (scannedText && scannedText.startsWith('000201')) {
            decodedPayload = scannedText.trim();
          }
        } catch (scanErr) {
          console.warn('[QRIS Auto-Decode Note]:', scanErr);
        }
      }

      const publicUrl = await uploadImageFile(file, {
        folder: 'qris',
        tenantSlug,
      });

      if (!publicUrl) {
        throw new Error('Gagal mengunggah gambar QRIS ke storage');
      }

      setStoreQrisUrl(publicUrl);
      if (decodedPayload) {
        setStoreQrisPayload(decodedPayload);
      }

      // Direct persist ke database Supabase (tenants.metadata)
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('id, metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (tenantRow?.id) {
            const updatedMeta = {
              ...(tenantRow.metadata || {}),
              qris_image_url: publicUrl,
              qris_url: publicUrl,
              qris_image: publicUrl,
              is_qris_active: true,
              qris_enabled: true,
              ...(decodedPayload ? {
                qris_payload: decodedPayload,
                qris_static_string: decodedPayload,
              } : {}),
              payment_settings: {
                ...(tenantRow.metadata?.payment_settings || {}),
                qris: publicUrl,
                is_qris_active: true,
              },
              payment_config: {
                ...(tenantRow.metadata?.payment_config || {}),
                enable_qris: true,
                qris_image_url: publicUrl,
                ...(decodedPayload ? {
                  qris_payload: decodedPayload,
                  raw_qris_string: decodedPayload,
                  static_qris_payload: decodedPayload,
                } : {}),
              },
            };
            await supabase
              .from('tenants')
              .update({ metadata: updatedMeta })
              .eq('id', tenantRow.id);
          }
        }
      } catch (sbErr) {
        console.warn('Direct Supabase QRIS sync note:', sbErr);
      }

      // Sync via settings API route
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qris_image_url: publicUrl,
            qris_url: publicUrl,
            qris_image: publicUrl,
            is_qris_active: true,
            qris_enabled: true,
            ...(decodedPayload ? {
              qris_payload: decodedPayload,
              qris_static_string: decodedPayload,
            } : {}),
          }),
        });
      } catch (settingsErr) {
        console.warn('Gagal sync qris_image_url via settings route:', settingsErr);
      }

      setSaveFeedback(
        decodedPayload
          ? '⚡ QRIS Dinamis & Gambar berhasil disimpan! Nominal otomatis terisi saat pembeli scan.'
          : '✅ Gambar QRIS berhasil disimpan!'
      );
      setTimeout(() => setSaveFeedback(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Gagal mengunggah QRIS');
    } finally {
      setIsUploadingQris(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantSlug) return;

    if (!file.type.startsWith('image/')) {
      alert('File logo harus berupa gambar');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file logo melebihi 5 MB');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const publicUrl = await uploadImageFile(file, {
        folder: 'logos',
        tenantSlug,
        maxWidth: 600,
        maxHeight: 600,
        quality: 0.9,
      });

      if (!publicUrl) {
        throw new Error('Gagal mengunggah logo ke storage');
      }

      setStoreLogoUrl(publicUrl);

      // Direct persist ke database Supabase (tenants.metadata.logo_url)
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('id, metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (tenantRow?.id) {
            const updatedMeta = {
              ...(tenantRow.metadata || {}),
              logo_url: publicUrl,
              avatar_url: publicUrl,
            };
            await supabase
              .from('tenants')
              .update({ metadata: updatedMeta })
              .eq('id', tenantRow.id);
          }
        }
      } catch (sbErr) {
        console.warn('Direct Supabase logo sync note:', sbErr);
      }

      // Sync via settings API route
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo_url: publicUrl }),
        });
      } catch (settingsErr) {
        console.warn('Settings API logo update warning:', settingsErr);
      }

      setSaveFeedback('✅ Logo toko berhasil disimpan!');
      setTimeout(() => setSaveFeedback(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Gagal mengunggah logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // 1. Fetch Tenant Settings from Supabase
  useEffect(() => {
    if (!tenantSlug) return;
    const fetchTenantSettings = async () => {
      try {
        const supabase = getSupabase();
        let tenant: any = null;

        if (supabase) {
          const { data: tRow } = await supabase
            .from('tenants')
            .select('*')
            .eq('slug', tenantSlug)
            .maybeSingle();
          tenant = tRow;
        }

        if (!tenant) {
          const res = await fetch(
            `https://mpluzajlzpregmjwpjqr.supabase.co/rest/v1/tenants?slug=eq.${encodeURIComponent(tenantSlug)}&select=*`,
            {
              headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
              },
            }
          );
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            tenant = data[0];
          }
        }

        const isLocalSession = checkClientSession(tenantSlug);

        // Security Guard 1: Local merchant session WAJIB ada dan cocok dengan tenantSlug
        if (!isLocalSession) {
          setIsAuthenticated(false);
          const redirectTarget = typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : `/${tenantSlug}/dashboard`;
          router.replace(`/login?redirectTo=${encodeURIComponent(redirectTarget)}`);
          return;
        }

        if (!tenant) {
          router.replace('/login');
          return;
        }

        // Security Guard 2: Verifikasi PIN jika tenant dilindungi PIN
        const expectedPin =
          tenant.metadata?.access_pin ||
          tenant.metadata?.pin_hash ||
          tenant.metadata?.pin ||
          null;

        if (expectedPin) {
          const storedPin = typeof window !== 'undefined' ? localStorage.getItem('merchant_pin') : null;
          if (!storedPin || storedPin.trim() !== String(expectedPin).trim()) {
            setIsAuthenticated(false);
            const redirectTarget = typeof window !== 'undefined'
              ? window.location.pathname + window.location.search
              : `/${tenantSlug}/dashboard`;
            router.replace(`/login?redirectTo=${encodeURIComponent(redirectTarget)}`);
            return;
          }
        }

        // Sesi & kredensial terverifikasi valid
        setIsAuthenticated(true);
        if (tenant.id) {
          setTenantId(tenant.id);
        }
        setTenantData(tenant);
        if (false) {
        } else {
          const resolvedBusinessType =
            tenant.business_type ||
            tenant.category ||
            tenant.metadata?.business_type ||
            tenant.metadata?.vertical_type ||
            tenant.metadata?.business_category ||
            'PHYSICAL';
          setStoreCategory(resolvedBusinessType);
          if (tenant.metadata?.capabilities) {
            setCapabilities(tenant.metadata.capabilities);
          }

          const storeNameFromDb =
            tenant.name ||
            tenant.metadata?.store_name ||
            tenant.metadata?.business_name;
          if (storeNameFromDb) setStoreDisplayName(storeNameFromDb);
          if (tenant.metadata?.whatsapp_number) setStoreWhatsapp(tenant.metadata.whatsapp_number);
          if (tenant.metadata?.bio) setStoreBio(tenant.metadata.bio);
          const qrisUrlFromDb =
            tenant.metadata?.qris_image_url ||
            tenant.metadata?.qris_url ||
            tenant.qris_image_url ||
            '';
          if (qrisUrlFromDb) setStoreQrisUrl(sanitizeImageUrl(qrisUrlFromDb));
          const qrisPayloadFromDb =
            tenant.metadata?.qris_payload ||
            tenant.metadata?.qris_static_string ||
            tenant.qris_payload ||
            '';
          if (qrisPayloadFromDb) setStoreQrisPayload(qrisPayloadFromDb);
          const logoUrlFromDb =
            tenant.metadata?.logo_url ||
            tenant.metadata?.avatar_url ||
            tenant.logo_url ||
            '';
          if (logoUrlFromDb) setStoreLogoUrl(sanitizeImageUrl(logoUrlFromDb));

          const botPausedFromDb = Boolean(tenant.metadata?.bot_paused || tenant.bot_paused);
          setIsTenantBotPaused(botPausedFromDb);

          // Hydrate Products: Prioritas Supabase (tenants.metadata.products & products table)
          let hydratedProducts: ProductItem[] = [];

          // 1. Cek tabel SQL `products` jika ada
          if (supabase && tenant.id) {
            try {
              const { data: dbProds } = await supabase
                .from('products')
                .select('*')
                .eq('tenant_id', tenant.id);
              if (Array.isArray(dbProds) && dbProds.length > 0) {
                hydratedProducts = (dbProds || []).filter(Boolean).map((p: any, idx: number) => {
                  const rawPt = (p?.product_type || '').toUpperCase();
                  const rawCat = (p?.category || '').toLowerCase();
                  const resolvedPt: ProductType = (p?.product_type || (rawCat === 'fisik' ? 'PHYSICAL' : (rawCat === 'jasa' || rawCat === 'service' ? 'FIELD_SERVICE' : 'DIGITAL'))) as ProductType;
                  return {
                    id: p?.id || `prod-${idx + 1}`,
                    name: p?.title || p?.name || `Produk ${idx + 1}`,
                    slug: p?.slug || p?.single_page_config?.slug || slugify(p?.title || p?.name || `produk-${idx + 1}`),
                    category: p?.category || (resolvedPt === 'PHYSICAL' ? 'Fisik' : (resolvedPt === 'SERVICE' || resolvedPt === 'FIELD_SERVICE' ? 'Jasa Lapangan' : (resolvedPt === 'PROFESSIONAL_SERVICE' ? 'Konsultasi' : (resolvedPt === 'AGENCY' ? 'Agency & Kreator' : (resolvedPt === 'FOOD' ? 'Kuliner & F&B' : 'Digital'))))),
                    product_type: resolvedPt,
                    type: p?.type || (resolvedPt === 'PHYSICAL' ? 'physical' : (resolvedPt === 'FOOD' ? 'fnb' : (resolvedPt === 'DIGITAL' ? 'digital' : 'service'))),
                    custom_badge: p?.custom_badge,
                    price: Number(p?.price) || 0,
                    promo_price: p?.promo_price ? Number(p?.promo_price) : 0,
                    variants: p?.variants || '',
                    promo: p?.promo || '',
                    description: p?.description || '',
                    download_url: p?.link_digital || p?.download_url || '',
                    image: sanitizeImageUrl(p?.image || p?.image_url || ''),
                    stock: p?.stock !== undefined ? Number(p?.stock) : 999999,
                    sku: p?.sku || `SKU-${idx + 1}`,
                    is_unlimited: p?.is_unlimited_stock ?? p?.is_unlimited ?? true,
                    weight_grams: p?.weight_grams,
                    fulfillment_metadata: p?.fulfillment_metadata,
                    single_page_config: p?.fulfillment_metadata?.single_page_config || p?.single_page_config,
                  };
                });
              }
            } catch (pTableErr) {
              console.debug('[Dashboard] SQL products table query note:', pTableErr);
            }
          }

          // 2. Ambil dari tenant.metadata.products (Single Source of Truth)
          const metaProducts = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
          if (metaProducts.length > 0) {
            const mappedMeta = metaProducts.filter(Boolean).map((p: any, idx: number) => {
              const rawPt = (p?.product_type || '').toUpperCase();
              const rawCat = (p?.category || '').toLowerCase();
              const resolvedPt: ProductType = (p?.product_type || (rawCat === 'fisik' ? 'PHYSICAL' : (rawCat === 'jasa' || rawCat === 'service' ? 'FIELD_SERVICE' : 'DIGITAL'))) as ProductType;
              return {
                id: p?.id !== undefined && p?.id !== null ? p.id : `prod-${idx + 1}`,
                name: p?.name || p?.title || `Produk ${idx + 1}`,
                slug: p?.slug || p?.single_page_config?.slug || slugify(p?.name || p?.title || `produk-${idx + 1}`),
                category: (p?.category as any) || (resolvedPt === 'PHYSICAL' ? 'Fisik' : (resolvedPt === 'SERVICE' || resolvedPt === 'FIELD_SERVICE' ? 'Jasa Lapangan' : (resolvedPt === 'PROFESSIONAL_SERVICE' ? 'Konsultasi' : (resolvedPt === 'AGENCY' ? 'Agency & Kreator' : (resolvedPt === 'FOOD' ? 'Kuliner & F&B' : 'Digital'))))),
                product_type: resolvedPt,
                type: p?.type || (resolvedPt === 'PHYSICAL' ? 'physical' : (resolvedPt === 'FOOD' ? 'fnb' : (resolvedPt === 'DIGITAL' ? 'digital' : 'service'))),
                custom_badge: p?.custom_badge,
                price: Number(p?.price) || 0,
                promo_price: p?.promo_price ? Number(p?.promo_price) : 0,
                variants: p?.variants || '',
                promo: p?.promo || '',
                description: p?.description || '',
                download_url: p?.download_url || p?.delivery_url || p?.link_digital || '',
                image: sanitizeImageUrl(p?.image || (Array.isArray(p?.images) && p.images[0]) || p?.image_url || ''),
                stock: p?.stock !== undefined ? Number(p?.stock) : 999999,
                sku: p?.sku || `SKU-${idx + 1}`,
                is_unlimited: p?.is_unlimited !== undefined ? p.is_unlimited : true,
                weight_grams: p?.weight_grams,
                fulfillment_metadata: p?.fulfillment_metadata,
                single_page_config: p?.single_page_config || p?.fulfillment_metadata?.single_page_config || p?.metadata?.single_page_config,
              };
            });

            // Gabungkan dengan prioritas metadata (update terbaru merchant)
            const metaIds = new Set(mappedMeta.map((m: any) => String(m.id)));
            const metaSlugs = new Set(mappedMeta.filter(Boolean).map((m: any) => String(m?.slug ?? '').toLowerCase()));
            const nonDuplicates = hydratedProducts.filter((hp: any) => !metaIds.has(String(hp.id)) && !metaSlugs.has(String(hp.slug).toLowerCase()));
            hydratedProducts = [...mappedMeta, ...nonDuplicates];
          }

          if (hydratedProducts.length > 0) {
            setProducts(hydratedProducts);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`bt_products_${tenantSlug}`, safeJsonStringify(sanitizeProductPayload(hydratedProducts)));
            }
          } else {
            setProducts([]);
            if (typeof window !== 'undefined') {
              localStorage.removeItem(`bt_products_${tenantSlug}`);
            }
          }

          // Category
          const rawCat = (
            tenant.business_type ||
            tenant.category ||
            tenant.metadata?.business_type ||
            tenant.metadata?.vertical_type ||
            tenant.metadata?.business_category ||
            'PHYSICAL'
          ).toUpperCase();

          if (['FOOD', 'FNB', 'KULINER'].some(k => rawCat.includes(k))) {
            setStoreCategory('FOOD');
          } else if (['PROFESSIONAL', 'CONSULT', 'LEGAL', 'TRAVEL', 'UMROH', 'PRO_SERVICE'].some(k => rawCat.includes(k))) {
            setStoreCategory('PROFESSIONAL_SERVICE');
          } else if (['LOCAL_SERVICE', 'FIELD_SERVICE', 'SERVICE', 'REPAIR', 'JASA'].some(k => rawCat.includes(k))) {
            setStoreCategory('FIELD_SERVICE');
          } else if (['AGENCY', 'CREATOR'].some(k => rawCat.includes(k))) {
            setStoreCategory('CREATOR_AGENCY');
          } else if (['DIGITAL', 'COURSE', 'SOFTWARE'].some(k => rawCat.includes(k))) {
            setStoreCategory('DIGITAL');
          } else {
            setStoreCategory('PHYSICAL');
          }

          const resolvedTier =
            tenant.subscription_tier ||
            tenant.tier ||
            tenant.metadata?.subscription?.plan_tier ||
            tenant.metadata?.tier ||
            tenant.metadata?.plan_tier ||
            'STARTER';
          const rawTier = String(resolvedTier).toLowerCase();
          const selectedPlanMeta = String(tenant.metadata?.selected_plan || tenant.metadata?.selectedPlan || '');
          const selectedPlanLower = selectedPlanMeta.toLowerCase();
          const planTypeMeta = String(tenant.metadata?.plan_type || '').toLowerCase();

          if (selectedPlanMeta) {
            setSelectedPlan(selectedPlanMeta);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`bt_selected_plan_${tenantSlug}`, selectedPlanMeta);
            }
          }

          setTenantFeatureFlags(prev => ({ ...prev, tier: resolvedTier }));

          // Prioritaskan Team Scale / Enterprise (DB canonical: ENTERPRISE, Tier Level 4/3)
          if (
            rawTier === 'enterprise' ||
            rawTier === 'team_scale' ||
            rawTier.includes('enterprise') ||
            rawTier.includes('team') ||
            planTypeMeta === 'team_scale' ||
            planTypeMeta === 'enterprise' ||
            selectedPlanLower.includes('enterprise') ||
            selectedPlanLower.includes('team') ||
            (selectedPlanLower.includes('scale') && !selectedPlanLower.includes('pro'))
          ) {
            setPlanTier('team_scale');
          // Ads Performance (DB canonical: PRO_SCALE, Tier Level 2)
          } else if (
            rawTier === 'pro_scale' ||
            rawTier === 'ads_performance' ||
            rawTier.includes('ads') ||
            rawTier.includes('performance') ||
            planTypeMeta === 'ads_performance' ||
            planTypeMeta === 'pro_scale' ||
            rawTier.includes('growth_plus') ||
            rawTier.includes('plus') ||
            selectedPlanLower.includes('ads') ||
            selectedPlanLower.includes('performance')
          ) {
            setPlanTier('ads_performance');
          // Solo / Starter / Checkout (DB canonical: STARTER)
          } else {
            setPlanTier('growth');
          }

          // Cek Special Grant (Akses Khusus)
          const subObj = tenant.metadata?.subscription;
          const isSpecialGrant = Boolean(
            subObj?.type === 'granted' ||
              subObj?.subscription_type === 'granted' ||
              subObj?.billing_cycle === 'grant' ||
              tenant.metadata?.subscription_type === 'granted' ||
              subObj?.is_grant === true
          );
          setIsGrant(isSpecialGrant);

          if (isSpecialGrant) {
            const grantValid =
              subObj?.valid_until ||
              tenant.subscription_ends_at ||
              tenant.metadata?.subscription_ends_at ||
              null;
            setGrantValidUntil(grantValid);
            setGrantDaysLeft(grantValid ? getRemainingDays(grantValid) : null);
            setTrialEndsAt(null);
            setTrialDaysLeft(null);
            setSubscriptionStatus('active');
          } else {
            setGrantValidUntil(null);
            setGrantDaysLeft(null);

            // Hitung sisa hari Reverse Trial (7 Hari) untuk Ads Performance Promo / Solo Trial
            const rawTrialEnds = tenant.trial_ends_at || tenant.metadata?.trial_ends_at;
            const isTrialStore =
              Boolean(tenant.metadata?.is_trial) ||
              Boolean(rawTrialEnds) ||
              rawTier.includes('trial') ||
              selectedPlanLower.includes('trial') ||
              resolvedTier === 'SOLO_TRIAL' ||
              ((rawTier === 'pro_scale' || rawTier.includes('ads')) && (Boolean(tenant.metadata?.is_trial) || Boolean(rawTrialEnds)));

            const rawSubStatus = tenant.subscription_status || tenant.metadata?.subscription_status;
            const finalSubStatus = rawSubStatus || (isTrialStore ? 'trial' : 'active');
            setSubscriptionStatus(finalSubStatus);

            const now = Date.now();
            const isStatusExpired =
              tenant.status === 'expired' ||
              tenant.status === 'suspended' ||
              (tenant.is_active === false && !isTrialStore && !Boolean(rawTrialEnds && new Date(rawTrialEnds).getTime() > now));
            const rawSubEnds = tenant.subscription_ends_at || tenant.metadata?.subscription_ends_at;
            const isSubExpired = rawSubEnds ? new Date(rawSubEnds).getTime() <= now : false;
            const isTrialExpired = rawTrialEnds ? new Date(rawTrialEnds).getTime() <= now : false;
            setIsSuspended(Boolean(isStatusExpired || isTrialExpired || (rawSubEnds ? isSubExpired : false)));

            if (isTrialStore || rawTrialEnds) {
              let finalTrialEnds = rawTrialEnds;
              if (!finalTrialEnds && tenant.created_at) {
                finalTrialEnds = new Date(new Date(tenant.created_at).getTime() + 7 * 86400000).toISOString();
              }
              setTrialEndsAt(finalTrialEnds || null);

              if (finalTrialEnds) {
                const diffMs = new Date(finalTrialEnds).getTime() - Date.now();
                const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                setTrialDaysLeft(days);
              } else {
                setTrialDaysLeft(7);
              }
            } else {
              setTrialEndsAt(null);
              setTrialDaysLeft(null);
            }
          }

          // Hydrate Interactive Menu dari metadata tenant
          const rawMenu =
            tenant.metadata?.interactive_menu ||
            tenant.metadata?.interactive_menus ||
            tenant.interactive_menu;

          const menuItems =
            tenant?.metadata?.interactive_menu?.items ||
            tenant?.metadata?.interactive_menu ||
            tenant?.metadata?.bot_config?.quick_actions ||
            rawMenu?.items ||
            (Array.isArray(rawMenu) ? rawMenu : null) ||
            [];

          const menuMode =
            tenant?.metadata?.interactive_menu?.mode ||
            rawMenu?.mode ||
            tenant?.metadata?.bot_mode ||
            'HYBRID';

          if (Array.isArray(menuItems) && menuItems.length > 0) {
            setInteractiveMenus(menuItems);
          }
          if (menuMode) {
            setBotMode(menuMode as 'STATIC' | 'HYBRID' | 'AI');
          }
          setIsBotActive(tenant?.metadata?.is_bot_active !== false);
          setBotPaused(Boolean(tenant?.metadata?.bot_paused === true));
          if (tenant?.metadata?.greeting_message || tenant?.metadata?.custom_greeting_message) {
            setStoreGreetingMessage(tenant.metadata.greeting_message || tenant.metadata.custom_greeting_message);
          }
        }
      } catch (err) {
        console.error('Gagal memuat data tenant:', err);
      }
    };
    fetchTenantSettings();
  }, [tenantSlug, router]);

  // 2. Fetch AI Settings
  useEffect(() => {
    let isMounted = true;
    async function loadTenantAiSettings() {
      if (!tenantSlug || tenantSlug === 'login' || tenantSlug === 'auth' || isAuthenticated !== true) return;
      try {
        setIsLoadingAi(true);
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`);
        if (res.ok) {
          const data = await res.json();
          const s = data.settings || {};
          if (s.qris_image_url) setStoreQrisUrl(s.qris_image_url);
          if (s.qris_payload || s.metadata?.qris_payload) {
            setStoreQrisPayload(s.qris_payload || s.metadata?.qris_payload);
          }
          if (s.logo_url) setStoreLogoUrl(s.logo_url);
          if (s.bio) setStoreBio(s.bio);
          if (s.greeting_message || s.custom_greeting_message || s.metadata?.greeting_message || s.metadata?.custom_greeting_message) {
            setStoreGreetingMessage(s.greeting_message || s.custom_greeting_message || s.metadata?.greeting_message || s.metadata?.custom_greeting_message);
          }
          if (s.metadata?.total_omzet || s.total_omzet) {
            setTenantMetaOmzet(Number(s.metadata?.total_omzet || s.total_omzet || 0));
          }
          if (s.is_suspended !== undefined) {
            setIsSuspended(Boolean(s.is_suspended));
          }
          if (s.subscription_status) {
            setSubscriptionStatus(s.subscription_status);
          }
          if (s.trial_ends_at) {
            setTrialEndsAt(s.trial_ends_at);
          }
          if (s.metadata?.selected_plan || s.metadata?.selectedPlan) {
            const planString = s.metadata?.selected_plan || s.metadata?.selectedPlan;
            setSelectedPlan(planString);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`bt_selected_plan_${tenantSlug}`, planString);
            }
          }
          const aiK = s.ai_knowledge || s.persona || {};
          const loadedStrategy = s.bot_strategy || aiK.bot_strategy || 'trust_builder';
          if (isMounted) {
            setBotStrategy(loadedStrategy as 'trust_builder' | 'balanced' | 'hard_selling');
            if (s.bot_mode) setBotMode(s.bot_mode as 'STATIC' | 'HYBRID' | 'AI');
            setAiForm(prev => ({
              ...prev,
              ai_name: aiK.ai_name || prev.ai_name,
              system_prompt: aiK.system_prompt || prev.system_prompt,
              tone: aiK.tone || prev.tone,
            }));
            const loadedGreeting = s.greeting_message || s.custom_greeting_message || s.metadata?.greeting_message || s.metadata?.custom_greeting_message;
            if (loadedGreeting) setGreetingMessage(loadedGreeting);

            const pol = s.sales_policy || s.playbook || s.metadata?.sales_policy || s.metadata?.playbook || {};
            setSalesPolicy(prev => ({
              price_objection: pol.price_objection || pol.scenarios?.priceObjection || prev.price_objection,
              closing_hook: pol.closing_hook || pol.scenarios?.closingHook || prev.closing_hook,
              discount_limit: Number(pol.discount_limit ?? prev.discount_limit),
              handover_trigger: pol.handover_trigger || prev.handover_trigger,
              handover_phone: pol.handover_phone || s.whatsapp_number || s.whatsapp || prev.handover_phone,
              custom_do_and_donts: pol.custom_do_and_donts || pol.customDoAndDonts || prev.custom_do_and_donts,
            }));

            if (Array.isArray(s.faqs) && s.faqs.length > 0) setFaqs(s.faqs);

            // Fallback membaca interactive_menu dari metadata tenant
            const rawMenu = s.interactive_menu || s.metadata?.interactive_menu || s.interactive_menus;
            const menuItems =
              rawMenu?.items ||
              (Array.isArray(rawMenu) ? rawMenu : null) ||
              s.metadata?.interactive_menu?.items ||
              s.metadata?.interactive_menu ||
              s.metadata?.bot_config?.quick_actions ||
              (Array.isArray(s.interactive_menus) ? s.interactive_menus : []);

            const menuMode =
              rawMenu?.mode ||
              s.metadata?.interactive_menu?.mode ||
              s.bot_mode ||
              'HYBRID';

            if (Array.isArray(menuItems) && menuItems.length > 0) {
              setInteractiveMenus(menuItems);
            }
            if (menuMode) {
              setBotMode(menuMode as 'STATIC' | 'HYBRID' | 'AI');
            }
          }
        }
      } catch (err) {
        console.error('Gagal memuat setting AI:', err);
      } finally {
        if (isMounted) setIsLoadingAi(false);
      }
    }
    loadTenantAiSettings();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug, isAuthenticated]);

  // 3. Sync URL Tab Param
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toLowerCase();
      if (tabParam) {
        if (tabParam === 'dashboard' || tabParam === 'overview' || tabParam === 'beranda') setActiveTab('dashboard');
        else if (tabParam === 'products' || tabParam === 'catalog') setActiveTab('catalog');
        else if (tabParam === 'orders' || tabParam === 'pesanan') setActiveTab('orders');
        else if (tabParam === 'finance' || tabParam === 'laporan' || tabParam === 'keuangan' || tabParam === 'analytics' || tabParam === 'integration') setActiveTab('finance');
        else if (tabParam === 'telegram' || tabParam === 'alerts' || tabParam === 'telegram_alerts') {
          setActiveTab('telegram_alerts');
        }
        else if (['inbox', 'ai_knowledge', 'ads_tracking', 'biteship', 'shipping', 'booking', 'downloads', 'campaigns', 'broadcast', 'whatsapp', 'auto_reply', 'rotator', 'microsite', 'themes', 'customers', 'crm', 'reseller', 'mitra', 'settings'].includes(tabParam)) {
          setActiveTab(tabParam === 'biteship' ? 'shipping' : tabParam === 'crm' ? 'customers' : tabParam === 'mitra' ? 'reseller' : tabParam as DashboardTab);
        }
      }
    }
  }, []);

  // 4. Fetch Transactions & Orders (Isolated per tenant)
  useEffect(() => {
    if (!tenantSlug || isAuthenticated !== true) return;
    const fetchTransactions = async () => {
      try {
        let ordersList: any[] = [];
        const supabase = getSupabase();
        if (supabase) {
          try {
            const agnosticData = await fetchTenantOrdersAgnostic(supabase, tenantSlug);
            if (Array.isArray(agnosticData.orders) && agnosticData.orders.length > 0) {
              ordersList = agnosticData.orders;
            }
          } catch (agnosticErr) {
            console.debug('[Dashboard] Agnostic orders fetch note:', agnosticErr);
          }
        }

        if (ordersList.length === 0) {
          const res = await fetch(`/api/orders?tenant=${encodeURIComponent(tenantSlug)}`).catch(() => null);
          if (res && res.ok) {
            const result = await res.json();
            ordersList = Array.isArray(result) ? result : (result.orders || result.data || []);
          }
        }

        setOrders(ordersList);
        setTransactions(ordersList);

        // 4b. Fetch Real Conversations from Supabase (Universal & 100% Tenant-Agnostic, Zero Dummy Mock)
        try {
          if (supabase) {
            const { data: dbConversations } = await supabase
              .from('conversations')
              .select('*')
              .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantSlug}`)
              .order('last_message_at', { ascending: false, nullsFirst: false })
              .limit(100);

            if (Array.isArray(dbConversations) && dbConversations.length > 0) {
              const convIds = dbConversations.map((c: any) => c.id);
              const { data: latestMsgs } = await supabase
                .from('messages')
                .select('conversation_id, text, message_body, sender, sender_type, created_at, payload, raw_payload')
                .in('conversation_id', convIds)
                .order('created_at', { ascending: false });

              const lastMsgMap: Record<string, any> = {};
              const leadMap: Record<string, any> = {};
              for (const m of (latestMsgs || [])) {
                if (!lastMsgMap[m.conversation_id]) {
                  lastMsgMap[m.conversation_id] = m;
                }
                const p = m.payload || m.raw_payload;
                if (p?.lead_qualification && !leadMap[m.conversation_id]) {
                  leadMap[m.conversation_id] = p.lead_qualification;
                }
              }

              const mappedChats: ChatConversation[] = dbConversations.map((c: any) => {
                const lastMsg = lastMsgMap[c.id];
                const lead = leadMap[c.id];
                const msgTime = c.last_message_at || c.updated_at || c.created_at;
                const updatedAt = msgTime ? new Date(msgTime) : new Date();
                const diffMs = Date.now() - updatedAt.getTime();
                const diffMin = Math.floor(diffMs / 60000);
                const diffHr = Math.floor(diffMs / 3600000);
                const diffDay = Math.floor(diffMs / 86400000);
                let timeLabel = 'Baru saja';
                if (diffMin < 1) timeLabel = 'Baru saja';
                else if (diffMin < 60) timeLabel = `${diffMin} mnt lalu`;
                else if (diffHr < 24) timeLabel = `${diffHr} jam lalu`;
                else timeLabel = `${diffDay} hari lalu`;

                const phone = c.customer_phone || c.phone_number || '';
                const name = c.customer_name || c.contact_name || phone || 'Pelanggan WhatsApp';

                return {
                  id: c.id,
                  customerPhone: phone,
                  customerName: name,
                  avatarInitials: (() => {
                    const parts = name.trim().split(/\s+/);
                    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
                  })(),
                  lastMessage: c.last_message || lastMsg?.message_body || lastMsg?.text || (lead ? `📋 Form kualifikasi dari ${lead.name || name}` : 'Percakapan baru'),
                  time: timeLabel,
                  status: (c.status === 'active' || c.status === 'online') ? 'online' : 'offline',
                  assignedTo: c.assigned_agent_id ? 'my_chat' : 'unassigned',
                  assignedAgentName: c.assigned_agent_name || (c.assigned_agent_id ? 'CS Aktif' : 'Unassigned / AI Bot'),
                  isBotActive: c.bot_paused === true ? false : (c.bot_mode === 'HUMAN_ACTIVE' ? false : true),
                  tag: lead ? 'Hot Lead' : (c.unread_count > 0 ? 'Pesan Baru' : 'Pelanggan'),
                  unreadCount: c.unread_count ?? (lead ? 1 : 0),
                  crm: lead ? {
                    totalOrders: 0,
                    lifetimeValue: 0,
                    city: lead.city || '',
                    notes: [
                      lead.store_name ? `Toko: ${lead.store_name}` : '',
                      lead.monthly_revenue ? `Omset: ${lead.monthly_revenue}` : '',
                      lead.store_link && lead.store_link !== 'Belum ada' ? `Link: ${lead.store_link}` : '',
                    ].filter(Boolean).join(' | '),
                  } : undefined,
                  messages: [],
                };
              });
              setConversations(mappedChats);
            } else {
              setConversations([]);
            }
          } else {
            setConversations([]);
          }
        } catch (convErr) {
          console.debug('[Dashboard] Conversations fetch note:', convErr);
          setConversations([]);
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
        setOrders([]);
        setTransactions([]);
        setConversations([]);
      }
    };
    fetchTransactions();
  }, [tenantSlug, isAuthenticated]);

  const financialMetrics = calculateFinancialMetrics(orders);
  const totalOmzet = financialMetrics.totalRevenue > 0 ? financialMetrics.totalRevenue : (tenantMetaOmzet > 0 ? tenantMetaOmzet : 0);
  const readyBalance = totalOmzet;
  const aov = financialMetrics.aov;
  const totalSuccessfulOrders = financialMetrics.totalSuccessfulOrders;
  const pendingVerificationCount = financialMetrics.pendingVerificationCount;
  const pendingVerificationAmount = financialMetrics.pendingVerificationAmount;
  const pendingVerificationOrders = financialMetrics.pendingVerificationOrders;

  // 5. Products Handlers
  const refreshProducts = async (): Promise<ProductItem[]> => {
    if (!tenantSlug) return [];
    try {
      const localRes = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`);
      if (localRes.ok) {
        const localData = await localRes.json();
        if (Array.isArray(localData.products)) {
          setProducts(localData.products);
          return localData.products;
        }
      }
    } catch { }
    return products;
  };

  useEffect(() => {
    if (activeTab === 'catalog' || activeTab === 'products') {
      refreshProducts();
    }
  }, [activeTab]);

  // Readiness evaluation (Strict Internal Route)
  useEffect(() => {
    let isMounted = true;
    async function evaluateStoreReadiness() {
      if (!tenantSlug || isAuthenticated !== true) return;
      try {
        const coreBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.boontrack.com').replace(/\/+$/, '');
        const res = await fetch(`${coreBase}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug)}/connect`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          const rawPhone = String(
            data.phone_number ||
            data.connected_phone ||
            tenantData?.whatsapp_number ||
            tenantData?.metadata?.whatsapp_number ||
            tenantData?.metadata?.wa_number ||
            storeWhatsapp ||
            ''
          ).trim();
          const isPlatform =
            rawPhone.includes('85181830080') ||
            rawPhone.includes('85179555449') ||
            rawPhone.includes('85139555449') ||
            data.mode === 'SHARED';

          const isConnected =
            (data.status === 'CONNECTED' || data.status === 'open' || data.state === 'open' || data.connected === true || data.is_connected === true) &&
            !isPlatform;

          if (isConnected && isMounted) {
            setWaStatus('CONNECTED');
            const finalPhone = rawPhone || (typeof storeWhatsapp === 'string' && storeWhatsapp ? storeWhatsapp : null);
            setConnectedPhone(finalPhone);
          } else if (isMounted) {
            setWaStatus('DISCONNECTED');
            setConnectedPhone(null);
          }
        }
      } catch (err) {
        console.debug('WhatsApp status readiness check note:', err);
      }

      if (isMounted) setIsStoreReadinessEvaluated(true);
    }
    evaluateStoreReadiness();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug, isAuthenticated]);

  const openNewProductModal = (initialData?: Partial<ProductItem>) => {
    const activeCount = products.filter(p => p.is_active !== false).length;
    if (isCheckoutLite && activeCount >= 3) {
      const quotaMsg = 'Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.';
      setSaveFeedback(quotaMsg);
      if (typeof window !== 'undefined') {
        alert(quotaMsg);
      }
      return;
    }

    setEditingProductId(null);
    const defaultProductType = mapBusinessCategoryToProductType(storeCategory);
    const chosenProductType = initialData?.product_type || defaultProductType;
    const reqs = resolveFulfillmentRequirements(chosenProductType);
    setProductForm({
      id: Date.now(),
      name: '',
      slug: '',
      type: chosenProductType === 'FOOD' ? 'fnb' : reqs.strategy === 'PHYSICAL' ? 'physical' : reqs.strategy === 'SERVICE' ? 'service' : 'digital',
      category: chosenProductType === 'FOOD' ? 'Kuliner & F&B' : reqs.strategy === 'PHYSICAL' ? 'Fisik' : reqs.strategy === 'SERVICE' ? (chosenProductType === 'PROFESSIONAL_SERVICE' ? 'Konsultasi' : chosenProductType === 'AGENCY' ? 'Agency & Kreator' : 'Jasa Lapangan') : 'Digital',
      custom_badge: '',
      price: 99000,
      promo_price: 0,
      variants: 'Standar',
      promo: '',
      description: '',
      download_url: '',
      image: '',
      stock: reqs.requiresShipping ? 100 : 9999,
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      is_unlimited: !reqs.requiresShipping,
      weight_grams: reqs.requiresWeight ? 1000 : undefined,
      checkout_type: 'internal',
      external_url: '',
      cta_label: '',
      ...(initialData || {}),
      product_type: chosenProductType,
    });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: ProductItem) => {
    if (!prod) return;
    setEditingProductId(prod.id);
    const safeProd = prod || ({} as ProductItem);
    const prodSlug = safeProd.slug || safeProd.single_page_config?.slug || slugify(safeProd.name || '');
    const resolvedProductType = safeProd.product_type || (safeProd.category?.toLowerCase() === 'fisik' || safeProd.category?.toLowerCase() === 'physical' ? 'PHYSICAL' : (safeProd.category?.toLowerCase() === 'jasa' || safeProd.category?.toLowerCase() === 'service' ? 'FIELD_SERVICE' : 'DIGITAL'));
    setProductForm({
      ...safeProd,
      product_type: resolvedProductType,
      category: safeProd.category || (resolvedProductType === 'PHYSICAL' ? 'Fisik' : (resolvedProductType === 'SERVICE' || resolvedProductType === 'FIELD_SERVICE' ? 'Jasa Lapangan' : (resolvedProductType === 'PROFESSIONAL_SERVICE' ? 'Konsultasi' : (resolvedProductType === 'AGENCY' ? 'Agency & Kreator' : (resolvedProductType === 'FOOD' ? 'Kuliner & F&B' : 'Digital'))))),
      custom_badge: safeProd.custom_badge || '',
      image: sanitizeImageUrl(safeProd.image),
      slug: prodSlug,
      stock: safeProd.stock ?? 100,
      sku: safeProd.sku || `SKU-${safeProd.id}`,
      is_unlimited: safeProd.is_unlimited ?? false,
      checkout_type: safeProd.checkout_type || (safeProd.external_url || safeProd.metadata?.external_url ? 'external' : 'internal'),
      external_url: safeProd.external_url || safeProd.metadata?.external_url || '',
      cta_label: safeProd.cta_label || safeProd.metadata?.cta_label || '',
    });
    setIsProductModalOpen(true);
  };

  const handleQuickStockChange = async (productId: number | string, delta: number) => {
    let updatedProducts: ProductItem[] = [];
    setProducts(prev => {
      updatedProducts = prev.map(p => {
        if (String(p.id) === String(productId)) {
          const newStock = Math.max(0, (p.stock || 0) + delta);
          return { ...p, stock: newStock };
        }
        return p;
      });
      return updatedProducts;
    });

    const changedProduct = updatedProducts.find(p => String(p.id) === String(productId));
    if (changedProduct && tenantSlug) {
      try {
        const cleanProduct = sanitizeProductPayload(changedProduct);
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: safeJsonStringify(cleanProduct),
        });
      } catch { }
    }
  };

  const handleToggleProductActive = async (productId: number | string, newStatus?: boolean) => {
    let updatedProducts: ProductItem[] = [];
    const currentProd = products.find(p => String(p.id) === String(productId));
    if (!currentProd) return;

    const targetNewActive = newStatus !== undefined ? newStatus : !(currentProd.is_active !== false);

    // If activating, verify Checkout Lite quota (maksimal 3 produk aktif)
    if (isCheckoutLite && targetNewActive) {
      const otherActiveCount = products.filter(p => String(p.id) !== String(productId) && p.is_active !== false).length;
      if (otherActiveCount >= 3) {
        const quotaMsg = 'Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.';
        if (typeof window !== 'undefined') {
          alert(quotaMsg);
        }
        return;
      }
    }

    setProducts(prev => {
      updatedProducts = prev.map(p => {
        if (String(p.id) === String(productId)) {
          return { ...p, is_active: targetNewActive };
        }
        return p;
      });
      return updatedProducts;
    });

    const changedProduct = updatedProducts.find(p => String(p.id) === String(productId));
    if (changedProduct && tenantSlug) {
      try {
        const cleanProduct = sanitizeProductPayload(changedProduct);
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: safeJsonStringify(cleanProduct),
        });
      } catch (err) {
        console.warn('[Dashboard] Error persisting product is_active status:', err);
      }
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm) return;
    const safeForm = sanitizeProductPayload(productForm);
    if (!safeForm.name || !tenantSlug) return;

    if (isSubscriptionExpired) {
      setSaveFeedback('Masa trial telah habis. Dashboard dalam mode baca-saja. Silakan lakukan upgrade paket untuk memperbarui toko.');
      setIsUpsellModalOpen(true);
      return;
    }

    const isTargetActive = safeForm.is_active !== false;
    if (isCheckoutLite && isTargetActive) {
      const isEditing = editingProductId !== null && editingProductId !== undefined;
      const otherActiveCount = products.filter(p => {
        if (!p) return false;
        if (isEditing && String(p.id) === String(editingProductId)) return false;
        return p.is_active !== false;
      }).length;

      if (otherActiveCount >= 3) {
        const quotaMsg = 'Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.';
        setSaveFeedback(quotaMsg);
        if (typeof window !== 'undefined') {
          alert(quotaMsg);
        }
        return;
      }
    }

    const finalSlug = (safeForm.slug?.trim() || slugify(safeForm.name) || 'produk').toLowerCase();
    const cleanImage = sanitizeImageUrl(safeForm.image);
    const defaultProductType = mapBusinessCategoryToProductType(storeCategory);
    const currentPt = (safeForm.product_type || defaultProductType || '').toUpperCase();
    const isPhysicalProduct = currentPt === 'PHYSICAL';
    const isServiceOrDigital = currentPt === 'SERVICE' || currentPt === 'DIGITAL_FILE' || currentPt === 'DIGITAL' || currentPt === 'PROFESSIONAL_SERVICE' || currentPt === 'FIELD_SERVICE' || currentPt === 'AGENCY';
    const isPhysicalStock = isPhysicalProduct || (!isServiceOrDigital && (storeCategory === 'PHYSICAL' || storeCategory === 'RETAIL' || storeCategory === 'FOOD'));
    const isExternalCheckout = safeForm.checkout_type === 'external' || Boolean(safeForm.external_url?.trim());
    const isRequiresShipping = isPhysicalProduct && !isExternalCheckout;
    const cleanExternalUrl = (safeForm.external_url || '').trim();
    const cleanCtaLabel = (safeForm.metadata?.cta_text || safeForm.cta_label || '').trim();
    const isCartEnabled = safeForm.metadata?.enable_cart !== undefined
      ? Boolean(safeForm.metadata.enable_cart)
      : ((safeForm as any)?.enable_cart !== undefined ? Boolean((safeForm as any)?.enable_cart) : isPhysicalProduct);

    const resolvedProductType: ProductType = (safeForm.product_type || (isPhysicalProduct ? 'PHYSICAL' : isServiceOrDigital ? (currentPt as ProductType) : defaultProductType)) as ProductType;

    const updatedProductItem: ProductItem = sanitizeProductPayload({
      ...safeForm,
      product_type: resolvedProductType,
      price: typeof safeForm.price === 'number' ? safeForm.price : (Number(safeForm.price) || 0),
      is_unlimited: isExternalCheckout ? true : (!isPhysicalStock ? true : (safeForm.is_unlimited ?? false)),
      stock: isExternalCheckout ? 999999 : (!isPhysicalStock ? 999999 : (safeForm.stock ?? 100)),
      weight_grams: isPhysicalProduct && !isExternalCheckout ? Number(safeForm.weight_grams || 1000) : 0,
      requires_shipping: isRequiresShipping,
      enable_cart: isCartEnabled,
      image: cleanImage,
      image_url: cleanImage,
      slug: finalSlug,
      checkout_type: isExternalCheckout ? 'external' : 'internal',
      external_url: isExternalCheckout ? cleanExternalUrl : undefined,
      cta_label: cleanCtaLabel || undefined,
      metadata: {
        ...(safeForm.metadata || {}),
        checkout_type: isExternalCheckout ? 'external' : 'internal',
        external_url: isExternalCheckout ? cleanExternalUrl : undefined,
        cta_label: cleanCtaLabel || undefined,
        cta_text: cleanCtaLabel || undefined,
        voucher_config: safeForm.metadata?.voucher_config,
        payment_methods: safeForm.metadata?.payment_methods,
        enable_cart: isCartEnabled,
      },
      single_page_config: (safeForm.single_page_config && typeof safeForm.single_page_config === 'object')
        ? {
          ...safeForm.single_page_config,
          slug: finalSlug,
          banner_url: sanitizeImageUrl(safeForm.single_page_config?.banner_url || cleanImage),
        }
        : undefined,
    });

    const newProdId = (editingProductId !== null && editingProductId !== undefined)
      ? editingProductId
      : (updatedProductItem.id || `prod-${Date.now()}`);
    const newProdSku = updatedProductItem.sku || `SKU-${finalSlug}`;

    const fullProductItem: ProductItem = sanitizeProductPayload({
      ...updatedProductItem,
      id: newProdId,
      sku: newProdSku,
      is_active: isTargetActive,
    });

    setSaveFeedback('⏳ Sedang menyimpan perubahan produk...');

    // Mutasi database WAJIB melalui API Route Gateway ber-service role key (bukan client anon yang terblokir RLS)
    try {
      const cleanProdPayload = sanitizeProductPayload(fullProductItem);
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeJsonStringify(cleanProdPayload),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok || resData.success === false) {
        const errorMsg = resData?.message || resData?.error || 'Gagal menyimpan produk ke database.';
        console.error('[Dashboard] Gagal menyimpan produk:', errorMsg);
        setSaveFeedback(`❌ ${errorMsg}`);
        return;
      }

      // Mutasi sukses di database -> update state lokal & localStorage
      let updatedProducts: ProductItem[];
      const returnedProduct = resData.product || fullProductItem;

      if (editingProductId !== null && editingProductId !== undefined) {
        updatedProducts = products.map(p =>
          (String(p.id) === String(editingProductId) || (p.slug && p.slug === finalSlug))
            ? { ...p, ...returnedProduct }
            : p
        );
        setProducts(updatedProducts);
        setSaveFeedback('✅ Produk berhasil diperbarui!');
      } else {
        updatedProducts = [returnedProduct, ...products];
        setProducts(updatedProducts);
        setSaveFeedback('✅ Produk baru berhasil ditambahkan!');
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(`bt_products_${tenantSlug}`, safeJsonStringify(sanitizeProductPayload(updatedProducts)));
      }

      setIsProductModalOpen(false);
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala jaringan saat menyimpan produk.';
      console.error('[Dashboard] Exception saat simpan produk:', err);
      setSaveFeedback(`❌ ${msg}`);
    }
  };

  const handleDeleteProduct = async (id: number | string) => {
    if (isSubscriptionExpired) {
      setSaveFeedback('Masa trial telah habis. Dashboard dalam mode baca-saja. Silakan lakukan upgrade paket untuk memperbarui toko.');
      setIsUpsellModalOpen(true);
      return;
    }
    if (!tenantSlug) return;
    if (confirm('Hapus produk ini dari etalase toko?')) {
      const targetProd = products.find(p => String(p.id) === String(id));
      const targetSlug = targetProd?.slug;

      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.message || errData?.error || 'Gagal menghapus produk dari database.');
        }

        const updated = products.filter(p => String(p.id) !== String(id) && (!targetSlug || p.slug !== targetSlug));
        setProducts(updated);
        setSaveFeedback('🗑️ Produk telah dihapus.');

        if (typeof window !== 'undefined') {
          localStorage.setItem(`bt_products_${tenantSlug}`, safeJsonStringify(sanitizeProductPayload(updated)));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal menghapus produk.';
        console.error('[Dashboard] Delete product error:', err);
        setSaveFeedback(`❌ ${msg}`);
      }

      setTimeout(() => setSaveFeedback(null), 3000);
    }
  };

  // 6. Single Page Checkout Handlers
  const openSinglePageBuilder = (prod: ProductItem) => {
    if (!prod) return;
    setActiveSinglePageProduct(prod);
    const prodSlug = prod.slug || slugify(prod.name || '');
    const existingVoucher = prod?.single_page_config?.voucher;
    const fulfillment = resolveFulfillmentRequirements(
      prod?.product_type || (prod?.category?.toLowerCase() === 'fisik' || prod?.category?.toLowerCase() === 'physical' ? 'PHYSICAL' : (prod?.category?.toLowerCase() === 'jasa' || prod?.category?.toLowerCase() === 'service' ? 'FIELD_SERVICE' : 'DIGITAL'))
    );
    const isPhysical = fulfillment.requiresShipping;

    const defaultVoucher: VoucherConfig = existingVoucher || {
      code: prod?.single_page_config?.discount_coupon || (isPhysical ? 'FREESHIP' : 'HEMAT50'),
      discount_type: 'nominal',
      discount_value: isPhysical ? 20000 : 50000,
      shipping_discount_type: isPhysical ? 'free' : 'none',
      shipping_discount_value: 0,
      min_spend: 50000,
    };

    const cfg = prod?.single_page_config || prod?.fulfillment_metadata?.single_page_config || (prod as any)?.metadata?.single_page_config;

    const isCustomHtmlActive = Boolean(
      (cfg?.enable_custom_html || (cfg as any)?.is_custom_html_enabled || (cfg as any)?.use_custom_html) &&
      cfg?.custom_html?.trim()
    );

    setSinglePageForm({
      slug: prodSlug,
      checkout_action_mode: cfg?.checkout_action_mode || 'DIRECT',
      whatsapp_custom_message: cfg?.whatsapp_custom_message || '',
      whatsapp_number: cfg?.whatsapp_number || '',
      enable_hero: isCustomHtmlActive ? (cfg?.enable_hero ?? false) : (cfg?.enable_hero ?? true),
      enable_client_logos: isCustomHtmlActive ? (cfg?.enable_client_logos ?? false) : (cfg?.enable_client_logos ?? false),
      enable_problem_solution: isCustomHtmlActive ? (cfg?.enable_problem_solution ?? false) : (cfg?.enable_problem_solution ?? true),
      enable_us_vs_them: isCustomHtmlActive ? (cfg?.enable_us_vs_them ?? false) : (cfg?.enable_us_vs_them ?? true),
      enable_testimonials: isCustomHtmlActive ? (cfg?.enable_testimonials ?? false) : (cfg?.enable_testimonials ?? true),
      enable_offer: isCustomHtmlActive ? (cfg?.enable_offer ?? false) : (cfg?.enable_offer ?? true),
      enable_faq: isCustomHtmlActive ? (cfg?.enable_faq ?? false) : (cfg?.enable_faq ?? false),
      enable_payment: cfg?.enable_payment !== false,
      enable_custom_html: isCustomHtmlActive || Boolean(cfg?.enable_custom_html),
      is_custom_html_enabled: isCustomHtmlActive || Boolean((cfg as any)?.is_custom_html_enabled),
      use_custom_html: isCustomHtmlActive || Boolean((cfg as any)?.use_custom_html),
      custom_html: cfg?.custom_html || '',
      sections_override: isCustomHtmlActive ? false : (cfg?.sections_override ?? true),
      active_section: isCustomHtmlActive ? 'custom_html' : ((cfg as any)?.active_section || undefined),
      enable_media_gallery: isCustomHtmlActive ? (cfg?.enable_media_gallery ?? false) : (cfg?.enable_media_gallery ?? Boolean(cfg?.gallery_images && cfg.gallery_images.length > 0)),
      gallery_images: cfg?.gallery_images ? [...cfg.gallery_images] : [],
      headline: cfg?.headline || prod.name,
      subheadline: cfg?.subheadline || prod.description,
      banner_url: cfg?.banner_url || prod.image,
      badge_text: cfg?.badge_text || (isPhysical ? 'Produk Fisik Kirim Langsung' : 'Direct Access Offer'),
      client_logos: cfg?.client_logos && cfg.client_logos.length > 0 ? [...cfg.client_logos] : [],
      problem_title: cfg?.problem_title || 'Apakah Anda Sering Menghadapi Masalah Ini?',
      pain_points:
        cfg?.pain_points && cfg.pain_points.length > 0
          ? [...cfg.pain_points]
          : [
            'Biaya promosi terus naik tapi hasil omset penjualan belum maksimal.',
            'Sulit meyakinkan calon pembeli karena penawaran terlihat sama dengan kompetitor.',
            'Kurang formula teruji yang bisa langsung dicontek dan dipraktekkan sekarang juga.',
          ],
      problem_image_url:
        cfg?.problem_image_url || '',
      solution_title: cfg?.solution_title || 'Kini Hadir Solusi Tepat untuk Melejitkan Konversi',
      solution_points:
        cfg?.solution_points && cfg.solution_points.length > 0
          ? [...cfg.solution_points]
          : [
            'Langkah praktis teruji berbasis data riil tanpa tebak-tebakan.',
            'Framework closing instan yang meningkatkan retensi dan repeat order.',
            'Dukungan penuh dengan materi yang adaptif dan siap diaplikasikan.',
          ],
      comparison_rows:
        cfg?.comparison_rows && cfg.comparison_rows.length > 0
          ? [...cfg.comparison_rows]
          : [
            { id: '1', feature: 'Kejelasan Strategi', others: 'Materi teori panjang tanpa alur jelas', us: 'Actionable blueprint langkah demi langkah' },
            { id: '2', feature: 'Efisiensi Biaya', others: 'Bakar anggaran promosi tanpa tracking', us: 'Optimalisasi presisi hemat biaya hingga 50%' },
            { id: '3', feature: 'Dukungan & Komunitas', others: 'Dibiarkan bingung sendiri setelah bayar', us: 'Grup diskusi & update materi berkala' },
          ],
      testimonial_images:
        cfg?.testimonial_images && cfg.testimonial_images.length > 0
          ? [...cfg.testimonial_images]
          : [],
      testimonials:
        cfg?.testimonials && cfg.testimonials.length > 0
          ? [...cfg.testimonials]
          : [],
      bonus_items:
        cfg?.bonus_items && cfg.bonus_items.length > 0
          ? [...cfg.bonus_items]
          : [
            { id: 'b1', title: 'Private Consultation & Community Access', value: 499000, description: 'Akses jaringan pebisnis & sesi tanya jawab' },
            { id: 'b2', title: 'Template SOP & Checklist Praktis', value: 299000, description: 'Dokumen kerja siap pakai langsung' },
          ],
      faqs:
        cfg?.faqs && cfg.faqs.length > 0
          ? [...cfg.faqs]
          : [],
      discount_coupon: defaultVoucher.code,
      voucher: defaultVoucher,
      enable_qris: cfg?.enable_qris ?? true,
      enable_manual_transfer: cfg?.enable_manual_transfer ?? true,
      affiliate_commission_rate: 0,
      video_url: cfg?.video_url || '',
      gallery_video_url: cfg?.gallery_video_url || '',
      limit_single_item: cfg?.limit_single_item ?? false,
      section_order: cfg?.section_order ? [...cfg.section_order] : [],
    });
    setIsSinglePageModalOpen(true);
  };

  const handleSaveSinglePageConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSinglePageProduct || !tenantSlug) return;

    setIsSavingSinglePage(true);
    const cleanSpForm = sanitizeProductPayload(singlePageForm);
    const prodSlug = cleanSpForm?.slug?.trim() || slugify(activeSinglePageProduct?.name || 'produk');

    // Rule: Jika Section #10 (custom_html) aktif dan terisi kode
    const hasCustomHtmlContent = Boolean(cleanSpForm.custom_html && cleanSpForm.custom_html.trim().length > 0);
    const isCustomHtmlActive = Boolean(
      (cleanSpForm.enable_custom_html || cleanSpForm.is_custom_html_enabled || cleanSpForm.use_custom_html) &&
      hasCustomHtmlContent
    );

    const customHtmlPayloadFlags = isCustomHtmlActive
      ? {
          is_custom_html_enabled: true,
          enable_custom_html: true,
          use_custom_html: true,
          active_section: 'custom_html',
          custom_html: cleanSpForm.custom_html,
          // Matikan render section bawaan agar tidak saling menimpa
          sections_override: false,
          enable_hero: false,
          enable_media_gallery: false,
          enable_client_logos: false,
          enable_problem_solution: false,
          enable_us_vs_them: false,
          enable_testimonials: false,
          enable_offer: false,
          enable_faq: false,
          enable_payment: cleanSpForm.enable_payment !== false,
          section_order: (cleanSpForm.section_order && cleanSpForm.section_order.includes('custom_html'))
            ? cleanSpForm.section_order
            : ['custom_html', 'payment_voucher'],
          checkout_mode: (cleanSpForm as any).checkout_mode || 'inline',
          enable_sticky_button: (cleanSpForm as any).enable_sticky_button,
          hide_floating_cta: Boolean((cleanSpForm as any).hide_floating_cta),
        }
      : {
          enable_custom_html: Boolean(cleanSpForm.enable_custom_html),
          is_custom_html_enabled: Boolean(cleanSpForm.is_custom_html_enabled),
          use_custom_html: Boolean(cleanSpForm.use_custom_html),
        };

    const updatedConfig: SinglePageConfig = sanitizeProductPayload({
      ...cleanSpForm,
      ...customHtmlPayloadFlags,
      slug: prodSlug,
      discount_coupon: cleanSpForm.voucher?.code || cleanSpForm.discount_coupon || '',
      checkout_action_mode: cleanSpForm.checkout_action_mode || 'DIRECT',
      whatsapp_custom_message: cleanSpForm.whatsapp_custom_message || '',
      whatsapp_number: cleanSpForm.whatsapp_number || '',
      hide_floating_cta: Boolean((cleanSpForm as any).hide_floating_cta),
      enable_sticky_button: (cleanSpForm as any).enable_sticky_button,
    });

    // Pertahankan local state form agar tidak mental balik
    setSinglePageForm(updatedConfig);

    const activeIdStr = String(activeSinglePageProduct.id || '').trim().toLowerCase();
    const activeSkuStr = (activeSinglePageProduct.sku || '').trim().toLowerCase();
    const activeSlugStr = (activeSinglePageProduct.slug || '').trim().toLowerCase();

    const isTargetProduct = (p: ProductItem) => {
      const pIdStr = String(p.id || '').trim().toLowerCase();
      const pSkuStr = (p.sku || '').trim().toLowerCase();
      const pSlugStr = (p.slug || '').trim().toLowerCase();
      return (
        (activeIdStr && pIdStr === activeIdStr) ||
        (activeSkuStr && pSkuStr === activeSkuStr) ||
        (activeSlugStr && pSlugStr === activeSlugStr)
      );
    };

    let updatedTargetProduct: ProductItem | null = null;
    const updatedProducts = products.map(p => {
      if (isTargetProduct(p)) {
        const ctaText = (cleanSpForm.cta_label || p.metadata?.cta_text || p.cta_label || '').trim();
        const updatedItem = sanitizeProductPayload({
          ...p,
          slug: prodSlug,
          cta_label: ctaText || undefined,
          single_page_config: updatedConfig,
          fulfillment_metadata: {
            ...(p.fulfillment_metadata || {}),
            single_page_config: updatedConfig,
          },
          metadata: {
            ...(p.metadata || {}),
            cta_text: ctaText || undefined,
            cta_label: ctaText || undefined,
            voucher_config: updatedConfig.voucher,
            checkout_action_mode: updatedConfig.checkout_action_mode,
            whatsapp_custom_message: updatedConfig.whatsapp_custom_message,
            enable_custom_html: updatedConfig.enable_custom_html,
            is_custom_html_enabled: updatedConfig.is_custom_html_enabled,
            use_custom_html: updatedConfig.use_custom_html,
            custom_html: updatedConfig.custom_html,
            sections_override: updatedConfig.sections_override,
            hide_floating_cta: Boolean((cleanSpForm as any).hide_floating_cta),
            enable_sticky_button: (cleanSpForm as any).enable_sticky_button,
          },
        });
        updatedTargetProduct = updatedItem;
        return updatedItem;
      }
      return p;
    });

    const cleanUpdatedProducts = sanitizeProductPayload(updatedProducts);
    setProducts(cleanUpdatedProducts);
    if (updatedTargetProduct) {
      setActiveSinglePageProduct(updatedTargetProduct);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(`bt_products_${tenantSlug}`, safeJsonStringify(cleanUpdatedProducts));
    }

    // Direct Mutation ke database Supabase (tenants.metadata.products) - APPEND & MERGE GUARANTEE
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow?.id) {
          const existingMetaProducts: ProductItem[] = Array.isArray(tenantRow.metadata?.products)
            ? tenantRow.metadata.products
            : (tenantRow.metadata?.product?.name ? [tenantRow.metadata.product] : []);
          const allKnownProducts = existingMetaProducts;

          const targetProd = cleanUpdatedProducts.find(p => isTargetProduct(p)) || updatedTargetProduct;
          if (targetProd) {
            const isTargetActive = targetProd.is_active !== false;
            const targetSku = (targetProd.sku || '').trim().toLowerCase();
            const targetId = String(targetProd.id || '').trim().toLowerCase();
            const targetSlug = (targetProd.slug || prodSlug).trim().toLowerCase();

            const editIndex = existingMetaProducts.findIndex(
              p =>
                String(p.id).toLowerCase() === targetId ||
                (targetSku && (p.sku || '').trim().toLowerCase() === targetSku) ||
                (targetSlug && (p.slug || '').toLowerCase() === targetSlug)
            );

            let finalMergedProducts: ProductItem[];
            if (editIndex >= 0) {
              finalMergedProducts = [...existingMetaProducts];
              finalMergedProducts[editIndex] = {
                ...finalMergedProducts[editIndex],
                ...targetProd,
                is_active: isTargetActive,
              };
            } else {
              const fullProductItem = { ...targetProd, is_active: isTargetActive };
              finalMergedProducts = [fullProductItem, ...allKnownProducts];
            }

            const cleanFinalMerged = sanitizeProductPayload(finalMergedProducts);
            const cleanUpdatedConfig = sanitizeProductPayload(updatedConfig);

            const existingCopy = tenantRow.metadata?.storefront_copy || {};
            const updatedCopy = {
              ...existingCopy,
              headline: cleanSpForm.headline || existingCopy.headline,
              subheadline: cleanSpForm.subheadline || existingCopy.subheadline,
              cta_label: cleanSpForm.cta_label || existingCopy.cta_label,
              cta_primary_label: cleanSpForm.cta_label || existingCopy.cta_primary_label,
            };

            const existingSections = tenantRow.metadata?.storefront_sections || tenantRow.metadata?.sections || {};
            const updatedSections = {
              ...existingSections,
              hero: { ...existingSections.hero, is_active: isCustomHtmlActive ? false : (cleanSpForm.enable_hero ?? true) },
              testimonials: { ...existingSections.testimonials, is_active: isCustomHtmlActive ? false : (cleanSpForm.enable_testimonials ?? true) },
              catalog: { ...existingSections.catalog, is_active: isCustomHtmlActive ? false : (cleanSpForm.enable_offer ?? true) },
              benefits: { ...existingSections.benefits, is_active: isCustomHtmlActive ? false : (cleanSpForm.enable_problem_solution ?? true) },
            };

            const updatedMeta = {
              ...(tenantRow.metadata || {}),
              products: cleanFinalMerged,
              product: cleanFinalMerged[0] || sanitizeProductPayload(targetProd),
              single_page_config: cleanUpdatedConfig,
              storefront_copy: updatedCopy,
              storefront_sections: updatedSections,
              ...(isCustomHtmlActive
                ? {
                    is_custom_html_enabled: true,
                    use_custom_html: true,
                    custom_html: cleanSpForm.custom_html,
                    active_section: 'custom_html',
                    sections_override: false,
                  }
                : {}),
            };

            await supabase
              .from('tenants')
              .update({ metadata: updatedMeta })
              .eq('id', tenantRow.id);

            // Sync juga ke tabel SQL products jika barisnya ada
            try {
              const isUuidVal = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(targetProd.id));
              const orFilters: string[] = [];
              if (prodSlug) orFilters.push(`slug.eq.${prodSlug}`);
              if (targetProd.sku) orFilters.push(`sku.eq.${targetProd.sku}`);
              if (isUuidVal) orFilters.push(`id.eq.${targetProd.id}`);

              if (orFilters.length > 0) {
                const { data: existingSql } = await supabase
                  .from('products')
                  .select('id, fulfillment_metadata')
                  .eq('tenant_id', tenantRow.id)
                  .or(orFilters.join(','))
                  .maybeSingle();

                if (existingSql?.id) {
                  await supabase.from('products').update({
                    slug: prodSlug,
                    fulfillment_metadata: {
                      ...(existingSql.fulfillment_metadata || {}),
                      single_page_config: updatedConfig,
                    },
                  }).eq('id', existingSql.id);
                }
              }
            } catch (sqlErr) {
              console.debug('[Dashboard] SQL products single page sync note:', sqlErr);
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn('[Dashboard] Direct Supabase single page save error:', dbErr);
    }

    try {
      const targetProd = cleanUpdatedProducts.find(p => isTargetProduct(p)) || updatedTargetProduct;
      if (targetProd) {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: safeJsonStringify(sanitizeProductPayload(targetProd)),
        });
      }
    } catch (err) {
      console.warn('Gagal sync single page ke backend:', err);
    } finally {
      setIsSavingSinglePage(false);
    }

    setIsSinglePageModalOpen(false);
    setSaveFeedback(`✅ Single Page Checkout untuk "${activeSinglePageProduct.name}" berhasil disimpan!`);
    setTimeout(() => setSaveFeedback(null), 4000);
  };

  // 7. Live Chat Handlers
  const activeConversation =
    conversations.find(c => c.id === activeConversationId) || (conversations.length > 0 ? conversations[0] : null);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeConversation) return;
    const newMsg: ConversationMessage = {
      id: Date.now(),
      sender: 'agent',
      text: replyText.trim(),
      time: 'Baru Saja',
    };
    const updatedConversations = conversations.map(c => {
      if (c.id === activeConversation.id) {
        return {
          ...c,
          lastMessage: newMsg.text,
          time: newMsg.time,
          messages: [...c.messages, newMsg],
        };
      }
      return c;
    });
    setConversations(updatedConversations);
    setReplyText('');
  };

  const handleToggleTenantBot = async () => {
    if (!tenantSlug) return;
    const newState = !isTenantBotPaused;
    setIsTenantBotPaused(newState);
    try {
      await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/bot-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_paused: newState }),
      });
    } catch (err) {
      console.warn('[Dashboard] Gagal sync bot_paused ke backend:', err);
    }
  };

  const handleSaveGreetingMessage = async (customMsg?: string) => {
    if (!tenantSlug) return;
    const textToSave = customMsg !== undefined ? customMsg : storeGreetingMessage;
    setIsSavingGreeting(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: tRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();
        const meta = tRow?.metadata || {};
        meta.greeting_message = textToSave;
        meta.custom_greeting_message = textToSave;
        await supabase
          .from('tenants')
          .update({
            metadata: meta,
            updated_at: new Date().toISOString(),
          })
          .eq('slug', tenantSlug);
      }

      await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          greeting_message: textToSave,
          custom_greeting_message: textToSave,
        }),
      });

      setStoreGreetingMessage(textToSave);
      setSaveFeedback('✅ Pesan sapaan otomatis WhatsApp berhasil disimpan!');
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err: any) {
      console.error('Error saving greeting message:', err);
      setSaveFeedback('⚠️ Gagal menyimpan pesan sapaan WhatsApp.');
      setTimeout(() => setSaveFeedback(null), 4000);
    } finally {
      setIsSavingGreeting(false);
    }
  };

  // 7a. Fetch messages for selected conversation from Supabase
  useEffect(() => {
    // Guard UUID syntax: only query messages if activeConversationId is a valid UUID
    if (!activeConversationId || !isValidUuid(activeConversationId) || isAuthenticated !== true) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const fetchMessages = async () => {
      try {
        const { data: msgs, error: msgErr } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', activeConversationId)
          .order('created_at', { ascending: true })
          .limit(150);

        if (msgErr) {
          console.debug('[Inbox] fetchMessages query error:', msgErr.message);
          return;
        }

        if (Array.isArray(msgs) && msgs.length > 0) {
          const mappedMsgs: ConversationMessage[] = msgs.map((m: any) => ({
            id: m.id || m.created_at || Date.now(),
            sender: m.sender === 'user' ? 'customer' : (m.sender === 'bot' ? 'bot' : 'agent'),
            senderName: m.user_name || undefined,
            text: m.text || '',
            time: m.created_at
              ? new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : '',
            isQris: m.payload?.is_qris || m.raw_payload?.is_qris,
            qrisData: m.payload?.qris_data || m.raw_payload?.qris_data,
            isBankTransfer: m.payload?.is_bank_transfer || m.raw_payload?.is_bank_transfer,
            bankData: m.payload?.bank_data || m.raw_payload?.bank_data,
            isLocation:
              m.type === 'LOCATION' ||
              m.payload?.is_location ||
              m.raw_payload?.is_location ||
              Boolean(m.metadata?.location || m.payload?.location || m.raw_payload?.location),
            locationData:
              m.metadata?.location ||
              m.payload?.location ||
              m.raw_payload?.location ||
              (m.metadata?.coordinates
                ? { latitude: m.metadata.coordinates.latitude, longitude: m.metadata.coordinates.longitude }
                : undefined),
          }));

          setConversations(prev =>
            prev.map(c => c.id === activeConversationId ? { ...c, messages: mappedMsgs } : c)
          );
        }
      } catch (msgErr) {
        console.debug('[Inbox] fetchMessages note:', msgErr);
      }
    };

    fetchMessages();
  }, [activeConversationId]);

  // 7b. Supabase Realtime: live push for conversations & messages (Inbox Console)
  useEffect(() => {
    if (!tenantSlug || isAuthenticated !== true) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const realtimeChannel = supabase
      .channel(`inbox_realtime_${tenantSlug}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${tenantSlug}`,
        },
        (payload: any) => {
          const c = payload.new || {};
          if (payload.eventType === 'INSERT') {
            setConversations(prev => {
              if (prev.some(x => x.id === c.id)) return prev;
              const newConv: ChatConversation = {
                id: c.id,
                customerPhone: c.phone_number || '',
                customerName: c.contact_name || 'Pelanggan WhatsApp',
                lastMessage: c.last_message || 'Percakapan baru',
                time: 'Baru saja',
                status: 'online',
                assignedTo: 'unassigned',
                isBotActive: true,
                messages: [],
              };
              return [newConv, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setConversations(prev =>
              prev.map(x =>
                x.id === c.id
                  ? { ...x, lastMessage: c.last_message || x.lastMessage, time: 'Baru saja', customerName: c.contact_name || x.customerName, isBotActive: c.bot_paused === true ? false : (c.bot_mode === 'HUMAN_ACTIVE' ? false : true) }
                  : x
              )
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `tenant_id=eq.${tenantSlug}`,
        },
        (payload: any) => {
          const m = payload.new || {};
          const convId = m.conversation_id;
          if (!convId) return;

          const newMsg: ConversationMessage = {
            id: m.id || Date.now(),
            sender: m.sender === 'user' ? 'customer' : (m.sender === 'bot' ? 'bot' : 'agent'),
            senderName: m.user_name || undefined,
            text: m.text || '',
            time: m.created_at
              ? new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : 'Baru saja',
          };

          setConversations(prev =>
            prev.map(c =>
              c.id === convId
                ? {
                    ...c,
                    messages: [...c.messages, newMsg],
                    lastMessage: m.text || c.lastMessage,
                    time: 'Baru saja',
                    unreadCount: c.id !== activeConversationId ? (c.unreadCount || 0) + 1 : c.unreadCount,
                  }
                : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [tenantSlug, isAuthenticated]);

  // 8. Finance / Withdrawal Handlers
  const handleProcessWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount <= 0 || withdrawAmount > readyBalance) {
      return alert('Nominal penarikan tidak valid atau melebihi saldo tersedia.');
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      setIsWithdrawModalOpen(false);
      setSaveFeedback(`💸 Permintaan penarikan Rp ${withdrawAmount.toLocaleString('id-ID')} berhasil diteruskan ke bank!`);
      setTimeout(() => setSaveFeedback(null), 4000);
    }, 1200);
  };

  // 9. AI / Strategy Handlers
  const handleSaveBotStrategy = async (strategyOverride?: 'trust_builder' | 'balanced' | 'hard_selling') => {
    if (!tenantSlug) return;
    const targetStrategy = strategyOverride || botStrategy;
    setIsSavingStrategy(true);
    try {
      const payload = {
        name: displayName,
        bot_strategy: targetStrategy,
        ai_knowledge: {
          ...aiForm,
          bot_strategy: targetStrategy,
        },
        persona: {
          ...aiForm,
          bot_strategy: targetStrategy,
        },
      };

      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      setStrategyFeedback('✅ Strategi persona bot berhasil disimpan!');
      setSaveFeedback('✅ Persona Bot Tersimpan');
      setTimeout(() => {
        setStrategyFeedback(null);
        setSaveFeedback(null), 4000;
      }, 4000);
    } catch (err) {
      alert('Gagal menyimpan strategi persona bot');
    } finally {
      setIsSavingStrategy(false);
    }
  };

  const handleSaveAiKnowledge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tenantSlug) return;
    setIsSavingAi(true);
    try {
      const payload = {
        name: displayName,
        assistant_name: aiForm.ai_name,
        system_prompt: aiForm.system_prompt,
        tone: aiForm.tone,
        greeting_message: greetingMessage,
        custom_greeting_message: greetingMessage,
        sales_policy: salesPolicy,
        playbook: salesPolicy,
        bot_strategy: botStrategy,
        bot_mode: botMode,
        is_bot_active: isBotActive,
        bot_paused: botPaused,
        faqs,
        interactive_menus: interactiveMenus,
        interactive_menu: {
          mode: botMode,
          items: interactiveMenus,
        },
        ai_knowledge: {
          ...aiForm,
          greeting_message: greetingMessage,
          sales_policy: salesPolicy,
        },
        persona: {
          ...aiForm,
          greeting_message: greetingMessage,
          sales_policy: salesPolicy,
        },
      };

      await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setSaveFeedback('✅ Pengaturan Bot Persona & System Prompt AI berhasil disimpan!');
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err) {
      alert('Gagal menyimpan pengaturan AI');
    } finally {
      setIsSavingAi(false);
    }
  };

  // 10. WhatsApp Engine Handlers (Strict Canonical Core Endpoint)
  const handleConnectGrowthSession = async (isReload = false) => {
    if (!tenantSlug) return;
    setIsQrLoading(true);
    setWaErrorMessage(null);
    setWaLoadingMessage(isReload ? 'Sedang memuat ulang sesi WhatsApp...' : 'Menghubungkan ke BoonTrack WhatsApp Engine...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const connectUrl = `/api/whatsapp/connect?tenant=${encodeURIComponent(tenantSlug)}${isReload ? '&action=reload&force=true' : ''}`;
      let res: Response;
      try {
        res = await fetch(connectUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
      } catch {
        // Fallback ke direct coreBase jika gateway proxy gagal
        const coreBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.boontrack.com').replace(/\/+$/, '');
        const fallbackUrl = `${coreBase}/api/v1/whatsapp/sessions/${encodeURIComponent(tenantSlug)}/connect${isReload ? '?force=true' : ''}`;
        res = await fetch(fallbackUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
      }

      // Status 202: IN_PROGRESS (Sedang menyiapkan sesi aman...)
      if (res.status === 202) {
        setIsQrLoading(true);
        setWaLoadingMessage('Sedang menyiapkan sesi aman...');
        setWaStatus('CONNECTING');
        setWaErrorMessage(null);
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Status 200: QR payload / Connected
      if (res.status === 200 || (res.ok && data?.success !== false)) {
        if (data.provider) setWaProvider(data.provider);
        if (data.mode) setWaConnectionMode(data.mode);

        const rawPhone = String(
          data.phone_number ||
          data.connected_phone ||
          tenantData?.whatsapp_number ||
          tenantData?.metadata?.whatsapp_number ||
          tenantData?.metadata?.wa_number ||
          storeWhatsapp ||
          ''
        ).trim();
        const isPlatform =
          rawPhone.includes('85181830080') ||
          rawPhone.includes('85179555449') ||
          rawPhone.includes('85139555449') ||
          data.mode === 'SHARED';

        const isConnected =
          (data.status === 'CONNECTED' || data.status === 'open' || data.state === 'open' || data.connected === true || data.is_connected === true) &&
          !isPlatform;

        if (isConnected) {
          setWaStatus('CONNECTED');
          const finalPhone = rawPhone || (typeof storeWhatsapp === 'string' && storeWhatsapp ? storeWhatsapp : null);
          setConnectedPhone(finalPhone);
          setQrCodeUrl(null);
          setQrImgError(false);
          setWaErrorMessage(null);
          setIsQrLoading(false);
          setWaLoadingMessage(null);
          return;
        }

        // Parsing payload QR: base64 / qrcode / code / qr_image / qr_raw
        const qrRaw =
          data?.base64 ||
          data?.qrcode?.base64 ||
          data?.qr_image ||
          data?.qrcode ||
          data?.qr ||
          data?.code ||
          data?.qr_raw ||
          null;

        if (qrRaw && typeof qrRaw === 'string') {
          const clean = qrRaw.replace(/^data:image\/[a-z]+;base64,/, '');
          if (!clean.startsWith('2@')) {
            setQrCodeUrl(`data:image/png;base64,${clean}`);
          } else {
            setQrCodeUrl(qrRaw);
          }
          setWaStatus('CONNECTING');
          setQrImgError(false);
          setWaErrorMessage(null);
          setIsQrLoading(false);
          setWaLoadingMessage(null);
        } else if (data.status === 'IN_PROGRESS' || data.status === 'connecting') {
          setIsQrLoading(true);
          setWaLoadingMessage('Sedang menyiapkan sesi aman...');
          setWaStatus('CONNECTING');
        } else {
          setIsQrLoading(false);
          setWaLoadingMessage(null);
          if (data.error) {
            setWaErrorMessage(data.error);
          }
        }
      } else {
        // Status 502 / error dari Core tanpa crash
        setIsQrLoading(false);
        setWaLoadingMessage(null);
        setWaStatus('DISCONNECTED');
        const errDetail =
          data?.error ||
          data?.detail ||
          data?.message ||
          (res.status === 502
            ? 'Layanan WhatsApp Gateway sedang sibuk (502). Silakan coba lagi.'
            : `Kendala koneksi Core (HTTP ${res.status})`);
        setWaErrorMessage(errDetail);
      }
    } catch (err: any) {
      setIsQrLoading(false);
      setWaLoadingMessage(null);
      setWaStatus('DISCONNECTED');
      if (err?.name === 'AbortError') {
        setWaErrorMessage('Koneksi ke gateway timeout (15 detik). Silakan coba lagi.');
      } else {
        setWaErrorMessage(err?.message || 'Kendala menghubungi server WhatsApp Core.');
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp' && tenantSlug && isAuthenticated === true) {
      handleConnectGrowthSession();
    }
  }, [activeTab, tenantSlug, isAuthenticated]);

  // 11. Background Polling while on 'whatsapp' tab and status is CONNECTING
  useEffect(() => {
    if (activeTab !== 'whatsapp' || !tenantSlug || waStatus !== 'CONNECTING' || isAuthenticated !== true) return;

    let consecutiveErrors = 0;
    let isCancelled = false;

    const pollUrl = `/api/whatsapp/connect?tenant=${encodeURIComponent(tenantSlug)}`;

    const pollInterval = setInterval(async () => {
      if (isCancelled) return;
      try {
        const res = await fetch(pollUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (res.status === 202) {
          setWaLoadingMessage('Sedang menyiapkan sesi aman...');
          return;
        }

        if (!res.ok) {
          consecutiveErrors++;
          // Hentikan / perlambat polling jika response 4xx client error
          if (res.status >= 400 && res.status < 500) {
            if (consecutiveErrors >= 3) {
              console.warn(`[WhatsApp Polling] Paused polling after repeated ${res.status} client error`);
              clearInterval(pollInterval);
              return;
            }
          }
          if (consecutiveErrors >= 5) {
            clearInterval(pollInterval);
            return;
          }
          return;
        }

        consecutiveErrors = 0;
        const data = await res.json().catch(() => ({}));
        if (isCancelled) return;

        if (data.provider) setWaProvider(data.provider);
        if (data.mode) setWaConnectionMode(data.mode);

        const rawPhone = String(
          data.phone_number ||
          data.connected_phone ||
          tenantData?.whatsapp_number ||
          tenantData?.metadata?.whatsapp_number ||
          tenantData?.metadata?.wa_number ||
          storeWhatsapp ||
          ''
        ).trim();
        const isPlatform =
          rawPhone.includes('85181830080') ||
          rawPhone.includes('85179555449') ||
          rawPhone.includes('85139555449') ||
          data.mode === 'SHARED';

        const isConnected =
          (data.status === 'CONNECTED' || data.status === 'open' || data.state === 'open' || data.connected === true || data.is_connected === true) &&
          !isPlatform;

        if (isConnected) {
          setWaStatus('CONNECTED');
          const finalPhone = rawPhone || (typeof storeWhatsapp === 'string' && storeWhatsapp ? storeWhatsapp : null);
          setConnectedPhone(finalPhone);
          setQrCodeUrl(null);
          setQrImgError(false);
          setWaErrorMessage(null);
          setIsQrLoading(false);
          setWaLoadingMessage(null);
          clearInterval(pollInterval);
        } else {
          const rawBase64 =
            data?.qrcode?.base64 ||
            data?.base64 ||
            data?.qr ||
            data?.qrcode ||
            data?.qr_image ||
            data?.code ||
            null;
          if (rawBase64 && typeof rawBase64 === 'string') {
            const clean = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
            const nextQr = !clean.startsWith('2@') ? `data:image/png;base64,${clean}` : rawBase64;
            setQrCodeUrl((prev) => (prev !== nextQr ? nextQr : prev));
            setQrImgError(false);
          }
          // Pastikan qrCodeUrl TIDAK dikosongkan jika koneksi sedang proses pairing (belum open)
        }
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          clearInterval(pollInterval);
        }
        console.debug('[WhatsApp Polling Note]', err);
      }
    }, 15000); // Minimum 15 detik untuk mencegah kehabisan quota egress

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
    };
  }, [activeTab, tenantSlug, waStatus]);

  return {
    tenantSlug,
    isAuthenticated,
    displayName,
    params,
    router,

    // Tiers & Gating
    planTier,
    setPlanTier,
    tenantFeatureFlags,
    isCheckoutLite,
    activeProductsCount: products.filter(p => p.is_active !== false).length,
    isTeamScale,
    isAdsPerformance,
    isProScale,
    isGrowthPlus,
    isGrowth,
    isAdsTrackingUnlocked,
    isSoloOrTrial,
    isTrialActive,
    selectedPlan,
    tierLabel,
    isBroadcastUnlocked,
    handleUpgradeTier,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    targetUpgradeTier,
    openUpgradeModal,

    // Store & Vertical
    storeCategory,
    businessType: storeCategory,
    capabilities,
    setStoreCategory,
    storeDisplayName,
    setStoreDisplayName,
    storeBio,
    setStoreBio,
    storeWhatsapp,
    setStoreWhatsapp,
    nameError,
    setNameError,
    storeQrisUrl,
    setStoreQrisUrl,
    storeQrisPayload,
    setStoreQrisPayload,
    isUploadingQris,
    handleQrisUpload,
    storeLogoUrl,
    setStoreLogoUrl,
    isUploadingLogo,
    handleLogoUpload,
    isStoreSettingsOpen,
    setIsStoreSettingsOpen,

    // Tabs & UI feedback
    activeTab,
    setActiveTab: handleSelectTab,
    saveFeedback,
    setSaveFeedback,
    isSimulatorOpen,
    setIsSimulatorOpen,

    // Products
    products,
    setProducts,
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

    // Bulk Import Modal
    isBulkImportModalOpen,
    setIsBulkImportModalOpen,

    // Single Page Builder Modal
    isSinglePageModalOpen,
    setIsSinglePageModalOpen,
    isSavingSinglePage,
    activeSinglePageProduct,
    singlePageForm,
    setSinglePageForm,
    openSinglePageBuilder,
    handleSaveSinglePageConfig,

    // AI Knowledge & Strategy
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
    isBotActive,
    setIsBotActive,
    botPaused,
    setBotPaused,
    isSavingAi,
    isLoadingAi,
    isSavingStrategy,
    strategyFeedback,
    handleSaveBotStrategy,
    handleSaveAiKnowledge,

    // WhatsApp Engine
    waMode,
    setWaMode,
    waStatus,
    setWaStatus,
    waProvider,
    setWaProvider,
    waConnectionMode,
    setWaConnectionMode,
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

    // Live Chat Conversations
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    replyText,
    setReplyText,
    handleSendMessage,
    isTenantBotPaused,
    setIsTenantBotPaused,
    handleToggleTenantBot,
    tenantId,
    tenantData,

    // Reverse Trial & Entitlement
    trialDaysLeft,
    trialEndsAt,
    subscriptionStatus,
    isSuspended,
    isSubscriptionExpired,
    isGrant,
    grantValidUntil,
    grantDaysLeft,
    isAiBotAllowed,
    isUpsellModalOpen,
    setIsUpsellModalOpen,

    // Finance & Transactions
    bankForm,
    setBankForm,
    transactions,
    orders,
    setOrders,
    totalOmzet,
    readyBalance,
    aov,
    totalSuccessfulOrders,
    pendingVerificationCount,
    pendingVerificationAmount,
    pendingVerificationOrders,
    financialMetrics,
    isWithdrawModalOpen,
    setIsWithdrawModalOpen,
    withdrawAmount,
    setWithdrawAmount,
    isWithdrawing,
    handleProcessWithdraw,
  };
}

