'use client';

// Hook: useTenantDashboard - Dynamic synchronization for orders, transactions, and WhatsApp inbox sessions

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBackendApiUrl } from '@/lib/api-config';
import { getPlatformWhatsApp } from '@/lib/tenant-config';
import {
  ProductItem,
  SinglePageConfig,
  VoucherConfig,
  TransactionItem,
  slugify,
  resolveFulfillmentRequirements,
} from '@/lib/product-catalog';
import { mapBusinessCategoryToProductType } from '../components/ProductFormModal';
import { getSupabase } from '@/lib/supabaseClient';
import { optimizeImageToWebP } from '@/components/ImageUpload';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import { mapProposalToAiForm } from '@/lib/boonpilotMapper';
import { sanitizeImageUrl, uploadImageFile } from '@/lib/image-utils';
import type { InteractiveMenu } from '@/lib/whatsappFormatter';
import {
  generateConversationsFromOrders,
} from '../components/tabs/mockInboxConversations';

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
  | 'settings';

export interface ConversationMessage {
  id: number | string;
  sender: 'customer' | 'agent' | 'bot' | 'system' | string;
  senderName?: string;
  text: string;
  time: string;
  isQris?: boolean;
  qrisData?: any;
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
  const [selectedPlan, setSelectedPlan] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`bt_selected_plan_${tenantSlug}`);
      if (stored) return stored;
    }
    return '';
  });

  // Reverse Trial Days Left & End Date
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [tenantMetaOmzet, setTenantMetaOmzet] = useState<number>(0);

  // Upsell Modal State for Locked Features
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);

  // Plan Tier
  const [planTier, setPlanTier] = useState<'growth' | 'ads_performance' | 'team_scale'>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tierParam = urlParams.get('tier')?.toLowerCase();
      if (tierParam) {
        if (['ads_performance', 'pro_scale', 'proscale', 'ads', 'performance', 'pro_ads', 'growth_tracking', 'growth+', 'growthplus', 'growth-plus', 'growth_plus', 'tracking'].some(t => tierParam.includes(t))) {
          return 'ads_performance';
        }
        if (['team_scale', 'enterprise'].some(t => tierParam.includes(t)) || (tierParam.includes('scale') && !tierParam.includes('pro'))) {
          return 'team_scale';
        }
        if (['growth', 'starter', 'solo'].some(t => tierParam.includes(t))) {
          return 'growth';
        }
      }
      const stored = localStorage.getItem(`bt_tier_${tenantSlug}`) as 'growth' | 'ads_performance' | 'team_scale' | null;
      if (stored && ['growth', 'ads_performance', 'team_scale'].includes(stored)) return stored;
    }
    return 'growth';
  });

  const isCheckoutLite =
    String(tenantFeatureFlags.tier || '').toUpperCase() === 'CHECKOUT_LITE' ||
    selectedPlan.toLowerCase().includes('checkout') ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('tier')?.toUpperCase() === 'CHECKOUT_LITE');

  // Ads Performance — DB canonical: 'PRO_SCALE' (ARCHITECTURE.md ADR)
  // Backward-compat aliases: 'ADS_PERFORMANCE', 'GROWTH_PLUS'
  const isAdsPerformance =
    !isCheckoutLite &&
    (planTier === 'ads_performance' ||
      String(tenantFeatureFlags.tier || '').toUpperCase() === 'PRO_SCALE' ||
      String(tenantFeatureFlags.tier || '').toUpperCase() === 'ADS_PERFORMANCE' ||
      String(tenantFeatureFlags.tier || '').toUpperCase() === 'GROWTH_PLUS' ||
      String(tenantFeatureFlags.tier || '').toUpperCase().includes('ADS') ||
      selectedPlan.toLowerCase().includes('ads') ||
      selectedPlan.toLowerCase().includes('performance'));

  // Team Scale — DB canonical: 'ENTERPRISE' (ARCHITECTURE.md ADR)
  // Backward-compat aliases: 'TEAM_SCALE'
  const isTeamScale =
    !isCheckoutLite &&
    !isAdsPerformance &&
    (planTier === 'team_scale' ||
      String(tenantFeatureFlags.tier || '').toUpperCase() === 'ENTERPRISE' ||
      String(tenantFeatureFlags.tier || '').toUpperCase() === 'TEAM_SCALE' ||
      selectedPlan.toLowerCase().includes('team'));

  const isProScale = isAdsPerformance;
  const isGrowthPlus = isAdsPerformance;
  const isGrowth = !isCheckoutLite && planTier === 'growth' && !isAdsPerformance && !isTeamScale;

  // Solo/Starter — DB canonical: 'STARTER' (ARCHITECTURE.md ADR)
  // Backward-compat aliases: 'SOLO', 'SOLO_TRIAL'
  const isSoloOrTrial = Boolean(
    !isAdsPerformance &&
    !isTeamScale &&
    (isCheckoutLite ||
      tenantFeatureFlags.tier === 'STARTER' ||
      tenantFeatureFlags.tier === 'SOLO' ||
      tenantFeatureFlags.tier === 'SOLO_TRIAL' ||
      selectedPlan.toLowerCase().includes('solo') ||
      selectedPlan.toLowerCase().includes('starter') ||
      (tenantFeatureFlags.tier && tenantFeatureFlags.tier.toLowerCase().includes('trial') && !tenantFeatureFlags.tier.toLowerCase().includes('ads') && !selectedPlan.toLowerCase().includes('ads')) ||
      isGrowth)
  );

  const isAdsTrackingUnlocked = !isCheckoutLite && !isSoloOrTrial && Boolean(
    isAdsPerformance ||
    isTeamScale ||
    tenantFeatureFlags.tier === 'PRO_SCALE' ||
    tenantFeatureFlags.tier === 'ADS_PERFORMANCE' ||
    tenantFeatureFlags.tier === 'ENTERPRISE' ||
    tenantFeatureFlags.tier === 'TEAM_SCALE'
  );

  const isBroadcastUnlocked = !isCheckoutLite && isTeamScale;

  const isAiBotAllowed = !isCheckoutLite && Boolean(
    isAdsPerformance ||
    isTeamScale ||
    tenantFeatureFlags.tier === 'PRO_SCALE' ||
    tenantFeatureFlags.tier === 'ADS_PERFORMANCE' ||
    tenantFeatureFlags.tier === 'ENTERPRISE' ||
    tenantFeatureFlags.tier === 'TEAM_SCALE'
  );

  const isTrialActive = Boolean(
    trialEndsAt ||
    (trialDaysLeft !== null && trialDaysLeft > 0) ||
    String(tenantFeatureFlags.tier || '').toLowerCase().includes('trial') ||
    selectedPlan.toLowerCase().includes('trial') ||
    (isAdsPerformance && Boolean(trialEndsAt || (trialDaysLeft !== null && trialDaysLeft > 0)))
  );

  // Standarisasi UI Dashboard: Label di bawah nama toko berdasarkan metadata.selected_plan
  // Fallback ke resolusi tier jika selectedPlan belum tersedia
  const tierLabel =
    selectedPlan ||
    (isCheckoutLite
      ? 'Paket Checkout'
      : isTeamScale
      ? 'Team Scale'
      : isAdsPerformance
      ? (isTrialActive || trialDaysLeft !== null ? 'Ads Performance Trial' : 'Ads Performance')
      : 'Paket Solo');

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

  const handleSelectTab = (tab: DashboardTab) => {
    hasUserSelectedTabRef.current = true;
    if (isCheckoutLite && !['dashboard', 'overview', 'catalog', 'products', 'orders', 'settings', 'shipping', 'ads_tracking', 'ads'].includes(tab)) {
      setActiveTab('dashboard');
      return;
    }
    setActiveTab(tab);
  };

  // WhatsApp Gateway State (Strict Multi-Tenant)
  const [waMode, setWaMode] = useState<'qr' | 'meta'>('qr');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED'>('DISCONNECTED');
  const [waErrorMessage, setWaErrorMessage] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [waProvider, setWaProvider] = useState<'EVOLUTION' | 'WABA'>('EVOLUTION');
  const [waConnectionMode, setWaConnectionMode] = useState<'SHARED' | 'DEDICATED'>('SHARED');

  // Conversations State (Isolated strictly by tenantSlug)
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    if (typeof window !== 'undefined' && tenantSlug) {
      try {
        const saved = localStorage.getItem(`bt_conversations_${tenantSlug}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (err) {
        console.warn('Gagal memuat percakapan dari storage:', err);
      }
    }
    return [];
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Products State
  const [products, setProducts] = useState<ProductItem[]>(() => {
    if (typeof window !== 'undefined' && tenantSlug) {
      try {
        const saved = localStorage.getItem(`bt_products_${tenantSlug}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch { }
    }
    return [];
  });
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | string | null>(null);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);

  // Single Page Checkout Builder State
  const [isSinglePageModalOpen, setIsSinglePageModalOpen] = useState(false);
  const [activeSinglePageProduct, setActiveSinglePageProduct] = useState<ProductItem | null>(null);
  const [singlePageForm, setSinglePageForm] = useState<SinglePageConfig>({
    slug: '',
    headline: '',
    subheadline: '',
    banner_url: '',
    badge_text: 'Direct Access Offer',
    problem_title: 'Apakah Anda Sering Menghadapi Masalah Ini?',
    pain_points: [],
    problem_image_url: '',
    solution_title: 'Kini Hadir Solusi Tepat untuk Anda',
    solution_points: [],
    comparison_rows: [],
    testimonial_images: [],
    bonus_items: [],
    enable_qris: true,
    enable_manual_transfer: true,
    discount_coupon: 'HEMAT50',
    affiliate_commission_rate: 0,
  });

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

        const isLocalSession = typeof window !== 'undefined' && (
          localStorage.getItem('merchant_store') === tenantSlug ||
          localStorage.getItem('merchant_session') === tenantSlug ||
          document.cookie.includes(`merchant_store=${tenantSlug}`) ||
          document.cookie.includes(`merchant_session=${tenantSlug}`)
        );

        if (!tenant) {
          if (isLocalSession) {
            setTenantFeatureFlags(prev => ({ ...prev, tier: 'STARTER' }));
            setPlanTier('growth');
            const fallbackEnds = new Date(Date.now() + 7 * 86400000).toISOString();
            setTrialEndsAt(fallbackEnds);
            setTrialDaysLeft(7);
          } else {
            router.replace('/login');
            return;
          }
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
                hydratedProducts = dbProds.map((p: any, idx: number) => ({
                  id: p.id || `prod-${idx + 1}`,
                  name: p.title || p.name || `Produk ${idx + 1}`,
                  slug: p.slug || p.single_page_config?.slug || slugify(p.title || p.name || `produk-${idx + 1}`),
                  category: p.category || (p.product_type === 'PHYSICAL' ? 'Fisik' : (p.product_type === 'SERVICE' || p.product_type === 'FIELD_SERVICE' ? 'Jasa Lapangan' : 'Digital')),
                  product_type: p.product_type || (p.category?.toLowerCase() === 'fisik' ? 'PHYSICAL' : (p.category?.toLowerCase() === 'jasa' || p.category?.toLowerCase() === 'service' ? 'FIELD_SERVICE' : 'DIGITAL')),
                  type: p.type || (p.product_type === 'PHYSICAL' ? 'physical' : (p.product_type === 'FOOD' ? 'fnb' : (p.product_type === 'DIGITAL' ? 'digital' : 'service'))),
                  custom_badge: p.custom_badge,
                  price: Number(p.price) || 0,
                  promo_price: p.promo_price ? Number(p.promo_price) : 0,
                  variants: p.variants || '',
                  promo: p.promo || '',
                  description: p.description || '',
                  download_url: p.link_digital || p.download_url || '',
                  image: sanitizeImageUrl(p.image || p.image_url || ''),
                  stock: p.stock !== undefined ? Number(p.stock) : 999999,
                  sku: p.sku || `SKU-${idx + 1}`,
                  is_unlimited: p.is_unlimited_stock ?? p.is_unlimited ?? true,
                  weight_grams: p.weight_grams,
                  fulfillment_metadata: p.fulfillment_metadata,
                  single_page_config: p.fulfillment_metadata?.single_page_config || p.single_page_config,
                }));
              }
            } catch (pTableErr) {
              console.debug('[Dashboard] SQL products table query note:', pTableErr);
            }
          }

          // 2. Ambil dari tenant.metadata.products (Single Source of Truth)
          const metaProducts = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
          if (metaProducts.length > 0) {
            const mappedMeta = metaProducts.map((p: any, idx: number) => ({
              id: p.id !== undefined && p.id !== null ? p.id : `prod-${idx + 1}`,
              name: p.name || p.title || `Produk ${idx + 1}`,
              slug: p.slug || p.single_page_config?.slug || slugify(p.name || p.title || `produk-${idx + 1}`),
              category: (p.category as any) || (p.product_type === 'PHYSICAL' ? 'Fisik' : (p.product_type === 'SERVICE' || p.product_type === 'FIELD_SERVICE' ? 'Jasa Lapangan' : (p.product_type === 'PROFESSIONAL_SERVICE' ? 'Konsultasi' : (p.product_type === 'AGENCY' ? 'Agency & Kreator' : (p.product_type === 'FOOD' ? 'Kuliner & F&B' : 'Digital'))))),
              product_type: p.product_type || (p.category?.toLowerCase() === 'fisik' ? 'PHYSICAL' : (p.category?.toLowerCase() === 'jasa' || p.category?.toLowerCase() === 'service' ? 'FIELD_SERVICE' : 'DIGITAL')),
              type: p.type || (p.product_type === 'PHYSICAL' ? 'physical' : (p.product_type === 'FOOD' ? 'fnb' : (p.product_type === 'DIGITAL' ? 'digital' : 'service'))),
              custom_badge: p.custom_badge,
              price: Number(p.price) || 0,
              promo_price: p.promo_price ? Number(p.promo_price) : 0,
              variants: p.variants || '',
              promo: p.promo || '',
              description: p.description || '',
              download_url: p.download_url || p.delivery_url || p.link_digital || '',
              image: sanitizeImageUrl(p.image || (Array.isArray(p.images) && p.images[0]) || p.image_url || ''),
              stock: p.stock !== undefined ? Number(p.stock) : 999999,
              sku: p.sku || `SKU-${idx + 1}`,
              is_unlimited: p.is_unlimited !== undefined ? p.is_unlimited : true,
              weight_grams: p.weight_grams,
              fulfillment_metadata: p.fulfillment_metadata,
              single_page_config: p.single_page_config,
            }));

            // Gabungkan dengan prioritas metadata (update terbaru merchant)
            const metaIds = new Set(mappedMeta.map((m: any) => String(m.id)));
            const metaSlugs = new Set(mappedMeta.map((m: any) => String(m.slug).toLowerCase()));
            const nonDuplicates = hydratedProducts.filter((hp: any) => !metaIds.has(String(hp.id)) && !metaSlugs.has(String(hp.slug).toLowerCase()));
            hydratedProducts = [...mappedMeta, ...nonDuplicates];
          }

          if (hydratedProducts.length > 0) {
            setProducts(hydratedProducts);
            if (typeof window !== 'undefined') {
              localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(hydratedProducts));
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

          const resolvedTier = tenant.tier || tenant.metadata?.tier || tenant.metadata?.plan_tier || 'STARTER';
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

          // Prioritaskan Ads Performance (DB canonical: PRO_SCALE)
          if (
            rawTier === 'pro_scale' ||
            rawTier === 'ads_performance' ||
            rawTier.includes('ads') ||
            rawTier.includes('performance') ||
            selectedPlanLower.includes('ads') ||
            selectedPlanLower.includes('performance') ||
            planTypeMeta === 'ads_performance' ||
            rawTier.includes('growth_plus') ||
            rawTier.includes('plus')
          ) {
            setPlanTier('ads_performance');
          // Team Scale (DB canonical: ENTERPRISE)
          } else if (
            rawTier === 'enterprise' ||
            rawTier === 'team_scale' ||
            rawTier.includes('team') ||
            selectedPlanLower.includes('team') ||
            (selectedPlanLower.includes('scale') && !selectedPlanLower.includes('pro')) ||
            planTypeMeta === 'team_scale'
          ) {
            setPlanTier('team_scale');
          // Solo / Starter / Checkout (DB canonical: STARTER)
          } else {
            setPlanTier('growth');
          }

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
      if (!tenantSlug || tenantSlug === 'login' || tenantSlug === 'auth') return;
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
          if (s.metadata?.total_omzet || s.total_omzet) {
            setTenantMetaOmzet(Number(s.metadata?.total_omzet || s.total_omzet || 0));
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
  }, [tenantSlug]);

  // 3. Sync URL Tab Param
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toLowerCase();
      if (tabParam) {
        hasUserSelectedTabRef.current = true;
        if (tabParam === 'dashboard') setActiveTab('dashboard');
        else if (tabParam === 'products' || tabParam === 'catalog') setActiveTab('catalog');
        else if (tabParam === 'orders' || tabParam === 'pesanan') setActiveTab('orders');
        else if (tabParam === 'overview' || tabParam === 'analytics' || tabParam === 'finance' || tabParam === 'laporan') setActiveTab('finance');
        else if (['inbox', 'ai_knowledge', 'ads_tracking', 'biteship', 'shipping', 'broadcast', 'whatsapp', 'auto_reply', 'rotator', 'microsite', 'settings'].includes(tabParam)) {
          setActiveTab(tabParam as DashboardTab);
        }
      }
    }
  }, []);

  // 4. Fetch Transactions & Orders (Isolated per tenant)
  useEffect(() => {
    if (!tenantSlug) return;
    const fetchTransactions = async () => {
      try {
        const res = await fetch(`/api/orders?tenant=${encodeURIComponent(tenantSlug)}`).catch(() => null);
        if (res && res.ok) {
          const result = await res.json();
          const ordersList = Array.isArray(result) ? result : (result.orders || result.data || []);
          console.log('[DEBUG Dashboard] Fetched orders:', ordersList.length);
          setOrders(ordersList);
          setTransactions(ordersList);

          // Cek percakapan riil dari tabel conversations di Supabase terlebih dahulu
          try {
            const supabase = getSupabase();
            if (supabase) {
              const { data: dbConversations } = await supabase
                .from('conversations')
                .select('*')
                .or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantSlug}`)
                .order('updated_at', { ascending: false });

              if (Array.isArray(dbConversations) && dbConversations.length > 0) {
                const mappedChats: ChatConversation[] = dbConversations.map((c: any) => ({
                  id: c.id,
                  customerPhone: c.phone_number || '',
                  customerName: c.contact_name || 'Pelanggan WhatsApp',
                  lastMessage: c.last_message || 'Percakapan berlangsung',
                  time: 'Baru saja',
                  status: 'online',
                  messages: [],
                }));
                setConversations(mappedChats);
                return;
              }
            }
          } catch (convErr) {
            console.debug('Direct conversations query note:', convErr);
          }

          if (ordersList.length > 0) {
            const scaledChats = generateConversationsFromOrders(ordersList);
            setConversations(scaledChats);
          } else {
            setConversations([]);
          }
        } else {
          setOrders([]);
          setTransactions([]);
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
  }, [tenantSlug]);

  const calculatedOmzet = orders
    .filter((o: any) => ['PAID', 'COMPLETED', 'SETTLEMENT', 'SUCCESS', 'LUNAS'].includes((o.payment_status || o.status || '').toUpperCase()))
    .reduce((sum: number, o: any) => sum + Number(o.gross_amount || o.total_amount || o.total_price || 0), 0);
  const totalOmzet = calculatedOmzet > 0 ? calculatedOmzet : (tenantMetaOmzet > 0 ? tenantMetaOmzet : 0);
  const readyBalance = totalOmzet;

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
      if (!tenantSlug) return;
      try {
        const res = await fetch(`/api/whatsapp/connect?tenant=${encodeURIComponent(tenantSlug)}`);
        if (res.ok) {
          const data = await res.json();
          const rawPhone = String(data.connected_phone || data.phone_number || '');
          const isPlatform =
            rawPhone.includes('85179555449') ||
            rawPhone.includes('85139555449') ||
            rawPhone.includes('1268977686299719') ||
            data.mode === 'SHARED';

          if (data.status === 'CONNECTED' && !isPlatform && rawPhone && isMounted) {
            setWaStatus('CONNECTED');
            setConnectedPhone(rawPhone);
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
  }, [tenantSlug]);

  const openNewProductModal = () => {
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
    const reqs = resolveFulfillmentRequirements(defaultProductType);
    setProductForm({
      id: Date.now(),
      name: '',
      slug: '',
      product_type: defaultProductType,
      type: defaultProductType === 'FOOD' ? 'fnb' : reqs.strategy === 'PHYSICAL' ? 'physical' : reqs.strategy === 'SERVICE' ? 'service' : 'digital',
      category: defaultProductType === 'FOOD' ? 'Kuliner & F&B' : reqs.strategy === 'PHYSICAL' ? 'Fisik' : reqs.strategy === 'SERVICE' ? (defaultProductType === 'PROFESSIONAL_SERVICE' ? 'Konsultasi' : defaultProductType === 'AGENCY' ? 'Agency & Kreator' : 'Jasa Lapangan') : 'Digital',
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
    });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: ProductItem) => {
    setEditingProductId(prod.id);
    const prodSlug = prod.slug || prod.single_page_config?.slug || slugify(prod.name);
    setProductForm({
      ...prod,
      category: prod.category || (prod.product_type === 'PHYSICAL' ? 'Fisik' : prod.product_type === 'SERVICE' ? 'Jasa Lapangan' : 'Digital'),
      custom_badge: prod.custom_badge || '',
      image: sanitizeImageUrl(prod.image),
      slug: prodSlug,
      stock: prod.stock ?? 100,
      sku: prod.sku || `SKU-${prod.id}`,
      is_unlimited: prod.is_unlimited ?? false,
      checkout_type: prod.checkout_type || (prod.external_url || prod.metadata?.external_url ? 'external' : 'internal'),
      external_url: prod.external_url || prod.metadata?.external_url || '',
      cta_label: prod.cta_label || prod.metadata?.cta_label || '',
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
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changedProduct),
        });
      } catch { }
    }
  };

  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !tenantSlug) return;

    const isTargetActive = productForm.is_active !== false;
    if (isCheckoutLite && isTargetActive) {
      const isEditing = editingProductId !== null && editingProductId !== undefined;
      const otherActiveCount = products.filter(p => {
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

    const finalSlug = (productForm.slug?.trim() || slugify(productForm.name)).toLowerCase();
    const cleanImage = sanitizeImageUrl(productForm.image);
    const isPhysicalStock = storeCategory === 'PHYSICAL' || storeCategory === 'RETAIL' || storeCategory === 'FOOD';
    const isExternalCheckout = productForm.checkout_type === 'external' || Boolean(productForm.external_url?.trim());
    const cleanExternalUrl = (productForm.external_url || '').trim();
    const cleanCtaLabel = (productForm.cta_label || '').trim();

    const updatedProductItem: ProductItem = {
      ...productForm,
      price: typeof productForm.price === 'number' ? productForm.price : (Number(productForm.price) || 0),
      is_unlimited: isExternalCheckout ? true : (!isPhysicalStock ? true : (productForm.is_unlimited ?? false)),
      stock: isExternalCheckout ? 999999 : (!isPhysicalStock ? 999999 : (productForm.stock ?? 100)),
      weight_grams: isExternalCheckout ? 0 : (!isPhysicalStock ? 0 : (productForm.weight_grams ?? 0)),
      image: cleanImage,
      image_url: cleanImage,
      slug: finalSlug,
      checkout_type: isExternalCheckout ? 'external' : 'internal',
      external_url: isExternalCheckout ? cleanExternalUrl : undefined,
      cta_label: cleanCtaLabel || undefined,
      metadata: {
        ...(productForm.metadata || {}),
        checkout_type: isExternalCheckout ? 'external' : 'internal',
        external_url: isExternalCheckout ? cleanExternalUrl : undefined,
        cta_label: cleanCtaLabel || undefined,
      },
      single_page_config: productForm.single_page_config
        ? {
          ...productForm.single_page_config,
          slug: finalSlug,
          banner_url: sanitizeImageUrl(productForm.single_page_config.banner_url || cleanImage),
        }
        : undefined,
    };

    let updatedProducts: ProductItem[];
    if (editingProductId !== null && editingProductId !== undefined) {
      updatedProducts = products.map(p => (String(p.id) === String(editingProductId) ? updatedProductItem : p));
      setProducts(updatedProducts);
      setSaveFeedback('✅ Produk berhasil diperbarui!');
    } else {
      const newProd = { ...updatedProductItem, id: updatedProductItem.id || `prod-${Date.now()}` };
      updatedProducts = [newProd, ...products];
      setProducts(updatedProducts);
      setSaveFeedback('✅ Produk baru berhasil ditambahkan!');
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(updatedProducts));
    }

    // 1. Direct Mutation ke database Supabase (tenants.metadata.products)
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
            products: updatedProducts,
            product: updatedProductItem,
          };

          const { error: tErr } = await supabase
            .from('tenants')
            .update({ metadata: updatedMeta })
            .eq('id', tenantRow.id);

          if (tErr) {
            console.error('[Dashboard] Direct Supabase product update failed:', tErr);
          }

          // Sync juga ke tabel SQL `products` jika ada
          try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(updatedProductItem.id));
            await supabase.from('products').upsert({
              ...(isUuid ? { id: String(updatedProductItem.id) } : {}),
              tenant_id: tenantRow.id,
              title: updatedProductItem.name,
              slug: finalSlug,
              description: updatedProductItem.description || '',
              price: Number(updatedProductItem.price),
              promo_price: updatedProductItem.promo_price ? Number(updatedProductItem.promo_price) : 0,
              image: cleanImage,
              image_url: cleanImage,
              category: updatedProductItem.category || 'service',
              stock: updatedProductItem.stock !== undefined ? Number(updatedProductItem.stock) : 999999,
              is_unlimited_stock: updatedProductItem.is_unlimited ?? true,
              asset_reference: `product:${finalSlug}`,
              license_status: 'UNVERIFIED',
              product_type: 'DIGITAL_FILE',
              fulfillment_metadata: updatedProductItem.fulfillment_metadata || {},
            });
          } catch (pTableErr) {
            console.debug('[Dashboard] SQL products table sync note:', pTableErr);
          }
        }
      }
    } catch (dbErr) {
      console.warn('Direct Supabase product save error:', dbErr);
    }

    // 2. Sync via API Route Gateway (forward ke core backend)
    try {
      await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProductItem),
      });
    } catch (err) {
      console.warn('Gagal sync produk ke API route:', err);
    }

    setIsProductModalOpen(false);
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleDeleteProduct = async (id: number | string) => {
    if (!tenantSlug) return;
    if (confirm('Hapus produk ini dari etalase toko?')) {
      const updated = products.filter(p => String(p.id) !== String(id));
      setProducts(updated);
      setSaveFeedback('🗑️ Produk telah dihapus.');

      if (typeof window !== 'undefined') {
        localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(updated));
      }

      // Direct delete ke database Supabase
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
              products: updated,
              product: updated[0] || null,
            };
            await supabase
              .from('tenants')
              .update({ metadata: updatedMeta })
              .eq('id', tenantRow.id);
          }
        }
      } catch (dbErr) {
        console.warn('Direct Supabase delete error:', dbErr);
      }

      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Gagal panggil DELETE produk:', err);
      }

      setTimeout(() => setSaveFeedback(null), 3000);
    }
  };

  // 6. Single Page Checkout Handlers
  const openSinglePageBuilder = (prod: ProductItem) => {
    setActiveSinglePageProduct(prod);
    const prodSlug = prod.slug || slugify(prod.name);
    const existingVoucher = prod.single_page_config?.voucher;
    const fulfillment = resolveFulfillmentRequirements(
      prod.product_type || (prod.category?.toLowerCase() === 'fisik' || prod.category?.toLowerCase() === 'physical' ? 'PHYSICAL' : (prod.category?.toLowerCase() === 'jasa' || prod.category?.toLowerCase() === 'service' ? 'FIELD_SERVICE' : 'DIGITAL'))
    );
    const isPhysical = fulfillment.requiresShipping;

    const defaultVoucher: VoucherConfig = existingVoucher || {
      code: prod.single_page_config?.discount_coupon || (isPhysical ? 'FREESHIP' : 'HEMAT50'),
      discount_type: 'nominal',
      discount_value: isPhysical ? 20000 : 50000,
      shipping_discount_type: isPhysical ? 'free' : 'none',
      shipping_discount_value: 0,
      min_spend: 50000,
    };

    const cfg = prod.single_page_config;

    setSinglePageForm({
      slug: prodSlug,
      headline: cfg?.headline || prod.name,
      subheadline: cfg?.subheadline || prod.description,
      banner_url: cfg?.banner_url || prod.image,
      badge_text: cfg?.badge_text || (isPhysical ? 'Produk Fisik Kirim Langsung' : 'Direct Access Offer'),
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
      bonus_items:
        cfg?.bonus_items && cfg.bonus_items.length > 0
          ? [...cfg.bonus_items]
          : [
            { id: 'b1', title: 'Private Consultation & Community Access', value: 499000, description: 'Akses jaringan pebisnis & sesi tanya jawab' },
            { id: 'b2', title: 'Template SOP & Checklist Praktis', value: 299000, description: 'Dokumen kerja siap pakai langsung' },
          ],
      discount_coupon: defaultVoucher.code,
      voucher: defaultVoucher,
      enable_qris: cfg?.enable_qris ?? true,
      enable_manual_transfer: cfg?.enable_manual_transfer ?? true,
      affiliate_commission_rate: 0,
    });
    setIsSinglePageModalOpen(true);
  };

  const handleSaveSinglePageConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSinglePageProduct || !tenantSlug) return;

    const prodSlug = singlePageForm.slug?.trim() || slugify(activeSinglePageProduct.name);
    const updatedConfig: SinglePageConfig = {
      ...singlePageForm,
      slug: prodSlug,
      discount_coupon: singlePageForm.voucher?.code || singlePageForm.discount_coupon || 'HEMAT50',
    };

    const updatedProducts = products.map(p => {
      if (p.id === activeSinglePageProduct.id) {
        return {
          ...p,
          slug: prodSlug,
          single_page_config: updatedConfig,
        };
      }
      return p;
    });

    setProducts(updatedProducts);

    try {
      const targetProd = updatedProducts.find(p => p.id === activeSinglePageProduct.id);
      if (targetProd) {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(targetProd),
        });
      }
    } catch (err) {
      console.warn('Gagal sync single page ke backend:', err);
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
          bot_strategy: botStrategy,
        },
        persona: {
          ...aiForm,
          bot_strategy: botStrategy,
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

  // 10. WhatsApp Engine Handlers (Strict Payload & Direct Base64 Capture)
  const handleConnectGrowthSession = async (isReload = false) => {
    if (!tenantSlug) return;
    setIsQrLoading(true);
    setWaErrorMessage(null);

    try {
      const url = `/api/whatsapp/connect?tenant=${encodeURIComponent(tenantSlug)}${isReload ? '&action=reload' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));

      if (data.provider) setWaProvider(data.provider);
      if (data.mode) setWaConnectionMode(data.mode);

      const rawPhone = String(data.phone_number || data.connected_phone || '');
      const isPlatform =
        rawPhone.includes('85179555449') ||
        rawPhone.includes('85139555449') ||
        rawPhone.includes('1268977686299719') ||
        data.mode === 'SHARED';

      if ((data.status === 'CONNECTED' || data.connected) && !isPlatform && rawPhone) {
        setWaStatus('CONNECTED');
        setConnectedPhone(rawPhone);
        setQrCodeUrl(null);
        setWaErrorMessage(null);
      } else {
        setWaStatus('CONNECTING');
        // Tangkap string gambar base64 murni dari respons BoonTrack WhatsApp Engine
        const qr = data.base64 || data.qr_image || data.qrcode?.base64 || null;
        if (qr) {
          setQrCodeUrl(qr);
        }
        setWaErrorMessage(null);
      }
    } catch (err) {
      setWaStatus('DISCONNECTED');
      setWaErrorMessage(null);
    } finally {
      setIsQrLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp' && tenantSlug) {
      handleConnectGrowthSession();
    }
  }, [activeTab, tenantSlug]);

  return {
    tenantSlug,
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
    handleSaveProductForm,
    handleDeleteProduct,

    // Bulk Import Modal
    isBulkImportModalOpen,
    setIsBulkImportModalOpen,

    // Single Page Builder Modal
    isSinglePageModalOpen,
    setIsSinglePageModalOpen,
    activeSinglePageProduct,
    singlePageForm,
    setSinglePageForm,
    openSinglePageBuilder,
    handleSaveSinglePageConfig,

    // AI Knowledge & Strategy
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
    isQrLoading,
    waErrorMessage,
    connectedPhone,
    setConnectedPhone,
    handleConnectGrowthSession,

    // Live Chat Conversations
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    replyText,
    setReplyText,
    handleSendMessage,

    // Reverse Trial & Entitlement
    trialDaysLeft,
    trialEndsAt,
    subscriptionStatus,
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
    isWithdrawModalOpen,
    setIsWithdrawModalOpen,
    withdrawAmount,
    setWithdrawAmount,
    isWithdrawing,
    handleProcessWithdraw,
  };
}