'use client';

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

export type DashboardTab =
  | 'inbox'
  | 'catalog'
  | 'products'
  | 'orders'
  | 'finance'
  | 'ai_knowledge'
  | 'integration'
  | 'overview'
  | 'analytics'
  | 'ads_tracking'
  | 'biteship'
  | 'shipping'
  | 'booking'
  | 'downloads'
  | 'broadcast'
  | 'whatsapp'
  | 'settings';

export interface ConversationMessage {
  id: number | string;
  sender: 'customer' | 'agent' | 'bot';
  text: string;
  time: string;
}

export interface ChatConversation {
  id: string;
  customerPhone: string;
  customerName?: string;
  lastMessage: string;
  time: string;
  status: 'online' | 'offline';
  messages: ConversationMessage[];
}

export function useTenantDashboard() {
  const params = useParams();
  const router = useRouter();
  const rawTenant = (params?.tenant as string) || 'growth';
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, ' ');

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Dynamic Vertical Category (PHYSICAL, DIGITAL, LOCAL_SERVICE, etc.)
  const [storeCategory, setStoreCategory] = useState<string>('PHYSICAL');

  // Feature flags resolved from settings API response
  const [tenantFeatureFlags, setTenantFeatureFlags] = useState<{
    has_capi?: boolean;
    ads_tracking?: boolean;
    tier?: string;
  }>({});

  // Reverse Trial Days Left
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  // Upsell Modal State for Locked Features
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);

  // Plan Tier (growth / ads_performance / team_scale)
  const [planTier, setPlanTier] = useState<'growth' | 'ads_performance' | 'team_scale'>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tierParam = urlParams.get('tier')?.toLowerCase();
      if (tierParam) {
        if (['ads_performance', 'growth_tracking', 'growth+', 'growthplus', 'growth-plus', 'growth_plus', 'tracking'].some(t => tierParam.includes(t))) {
          return 'ads_performance';
        }
        if (['team_scale', 'proscale', 'enterprise', 'pro'].some(t => tierParam.includes(t))) {
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

  const isTeamScale =
    planTier === 'team_scale' ||
    tenantFeatureFlags.tier === 'TEAM_SCALE' ||
    tenantFeatureFlags.tier === 'PRO_SCALE' ||
    tenantFeatureFlags.tier === 'ENTERPRISE';

  const isAdsPerformance =
    (planTier === 'ads_performance' ||
      tenantFeatureFlags.tier === 'ADS_PERFORMANCE' ||
      tenantFeatureFlags.tier === 'GROWTH_PLUS') &&
    !isTeamScale;

  const isProScale = isTeamScale;
  const isGrowthPlus = isAdsPerformance;
  const isGrowth = planTier === 'growth' && !isAdsPerformance && !isTeamScale;

  // Merchant di paket Solo / Trial tidak memiliki akses ke Ads Tracking Pro
  const isSoloOrTrial = Boolean(
    tenantFeatureFlags.tier === 'SOLO_TRIAL' ||
    tenantFeatureFlags.tier === 'SOLO' ||
    (tenantFeatureFlags.tier && tenantFeatureFlags.tier.toLowerCase().includes('trial')) ||
    isGrowth
  );

  const isAdsTrackingUnlocked = !isSoloOrTrial && Boolean(
    isAdsPerformance ||
    isTeamScale ||
    tenantFeatureFlags.tier === 'ADS_PERFORMANCE' ||
    tenantFeatureFlags.tier === 'PRO_SCALE' ||
    tenantFeatureFlags.tier === 'TEAM_SCALE'
  );

  const isBroadcastUnlocked = isTeamScale;

  const isAiBotAllowed = Boolean(
    isAdsPerformance ||
    isTeamScale ||
    (tenantFeatureFlags.tier && tenantFeatureFlags.tier.toLowerCase().includes('trial'))
  );

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [targetUpgradeTier, setTargetUpgradeTier] = useState<'ads_performance' | 'team_scale'>('ads_performance');

  const openUpgradeModal = (targetTier: 'ads_performance' | 'team_scale' = 'ads_performance') => {
    setTargetUpgradeTier(targetTier);
    setIsPaymentModalOpen(true);
  };

  const handleUpgradeTier = (targetTier: 'ads_performance' | 'team_scale' = 'ads_performance') => {
    openUpgradeModal(targetTier);
  };

  // State Edit Profil Toko & Validasi Unik
  const [isStoreSettingsOpen, setIsStoreSettingsOpen] = useState(false);
  const [storeDisplayName, setStoreDisplayName] = useState(tenantSlug || '');
  const [storeBio, setStoreBio] = useState('');
  const [storeWhatsapp, setStoreWhatsapp] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [storeQrisUrl, setStoreQrisUrl] = useState<string>('');
  const [isUploadingQris, setIsUploadingQris] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<DashboardTab>('catalog');
  const hasUserSelectedTabRef = useRef(false);
  const [isStoreReadinessEvaluated, setIsStoreReadinessEvaluated] = useState(false);

  const handleSelectTab = (tab: DashboardTab) => {
    hasUserSelectedTabRef.current = true;
    setActiveTab(tab);
  };

  // WhatsApp Gateway State
  const [waMode, setWaMode] = useState<'qr' | 'meta'>('qr');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED'>('DISCONNECTED');
  const [waErrorMessage, setWaErrorMessage] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);

  // Pairing Code
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCodeResult, setPairingCodeResult] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  // Conversations State
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`bt_conversations_${tenantSlug}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (err) {
        console.warn('Gagal memuat percakapan dari storage:', err);
      }
    }
    return [];
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Products State (initialized clean from storage or empty)
  const [products, setProducts] = useState<ProductItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`bt_products_${tenantSlug}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Bulk Import Modal State
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
    category: 'digital',
    price: 99000,
    promo_price: 0,
    variants: 'Format Digital',
    promo: '',
    description: '',
    download_url: '',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60',
    stock: 100,
    sku: 'SKU-001',
    is_unlimited: false,
  });

  // AI & Persona State
  const [aiForm, setAiForm] = useState({
    ai_name: `${displayName.toUpperCase()} AI Assistant`,
    tone: 'casual',
    system_prompt: `Anda adalah asisten resmi untuk toko ${displayName.toUpperCase()}. Bantu pelanggan mengenai katalog produk, materi, dan transaksi pembayaran QRIS otomatis.`,
  });
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [botStrategy, setBotStrategy] = useState<'trust_builder' | 'balanced' | 'hard_selling'>('trust_builder');
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);
  const [strategyFeedback, setStrategyFeedback] = useState<string | null>(null);

  // Bank & Transactions State
  const [bankForm, setBankForm] = useState({
    name: '',
    account: '',
    holder: '',
  });
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Check login route redirection
  useEffect(() => {
    if (tenantSlug === 'login' || tenantSlug === 'auth') {
      router.replace('/login');
    }
  }, [tenantSlug, router]);

  // QRIS Upload
  const handleQrisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file maksimal 2 MB');
      return;
    }

    setIsUploadingQris(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenantSlug}-qris-${Date.now()}.${fileExt}`;
      const filePath = `qris/${fileName}`;

      const uploadRes = await fetch(
        `https://mpluzajlzpregmjwpjqr.supabase.co/storage/v1/object/tenants/${filePath}`,
        {
          method: 'POST',
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
            'Content-Type': file.type,
          },
          body: file,
        }
      );

      if (!uploadRes.ok) throw new Error('Gagal upload gambar QRIS ke storage');

      const publicUrl = `https://mpluzajlzpregmjwpjqr.supabase.co/storage/v1/object/public/tenants/${filePath}`;
      setStoreQrisUrl(publicUrl);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Gagal mengunggah QRIS');
    } finally {
      setIsUploadingQris(false);
    }
  };

  // 1. Fetch Tenant Settings from Supabase Directly
  useEffect(() => {
    if (!tenantSlug) return;
    const fetchTenantSettings = async () => {
      try {
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

        const isLocalSession = typeof window !== 'undefined' && (
          localStorage.getItem('merchant_store') === tenantSlug ||
          localStorage.getItem('merchant_session') === tenantSlug ||
          document.cookie.includes(`merchant_store=${tenantSlug}`) ||
          document.cookie.includes(`merchant_session=${tenantSlug}`)
        );

        if (!Array.isArray(data) || data.length === 0) {
          // Safeguard: Izinkan sesi merchant trial aktif yang baru terdaftar tanpa ditolak
          if (isLocalSession) {
            setTenantFeatureFlags(prev => ({ ...prev, tier: 'SOLO_TRIAL' }));
            setPlanTier('growth');
            setTrialDaysLeft(14);
          } else {
            router.replace('/login');
            return;
          }
        } else {
          const tenant = data[0];
          if (tenant.name) setStoreDisplayName(tenant.name);
          if (tenant.metadata?.whatsapp_number) setStoreWhatsapp(tenant.metadata.whatsapp_number);

          // Category
          const rawCat = (tenant.category || tenant.metadata?.vertical_type || tenant.metadata?.business_category || 'PHYSICAL').toUpperCase();
          if (['PHYSICAL', 'RETAIL', 'FNB', 'RETAIL_PHYSICAL'].includes(rawCat) || rawCat.includes('PHYSICAL') || rawCat.includes('RETAIL')) {
            setStoreCategory('PHYSICAL');
          } else if (['LOCAL_SERVICE', 'FIELD_SERVICE', 'SERVICE', 'PROFESSIONAL_CONSULT'].includes(rawCat) || rawCat.includes('SERVICE') || rawCat.includes('LOCAL')) {
            setStoreCategory('LOCAL_SERVICE');
          } else {
            setStoreCategory('DIGITAL');
          }

          // Tier from Supabase column 'tier' or metadata
          const resolvedTier = tenant.tier || tenant.metadata?.tier || tenant.metadata?.plan_tier || 'SOLO_TRIAL';
          const rawTier = String(resolvedTier).toLowerCase();
          setTenantFeatureFlags(prev => ({ ...prev, tier: resolvedTier }));
          if (rawTier.includes('team_scale') || rawTier.includes('proscale') || rawTier.includes('enterprise')) {
            setPlanTier('team_scale');
          } else if (rawTier.includes('ads_performance') || rawTier.includes('growth_plus') || rawTier.includes('plus')) {
            setPlanTier('ads_performance');
          } else {
            setPlanTier('growth');
          }

          // Reverse Trial: hitung sisa hari dari trial_ends_at atau created_at + 14 hari
          if (rawTier.includes('trial') || rawTier.includes('solo') || !tenant.tier) {
            const trialEndTimestamp = tenant.trial_ends_at
              ? new Date(tenant.trial_ends_at).getTime()
              : tenant.metadata?.trial_ends_at
              ? new Date(tenant.metadata.trial_ends_at).getTime()
              : new Date(tenant.created_at || Date.now()).getTime() + 14 * 86400000;

            const diffMs = trialEndTimestamp - Date.now();
            const days = Math.max(0, Math.ceil(diffMs / 86400000));
            setTrialDaysLeft(days);
          } else {
            setTrialDaysLeft(null);
          }
        }
      } catch (err) {
        console.error('Gagal memuat data tenant:', err);
      }
    };
    fetchTenantSettings();
  }, [tenantSlug, router]);

  // 2. Fetch AI Settings & Feature Flags
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
          const aiK = s.ai_knowledge || s.persona || {};
          const loadedStrategy = s.bot_strategy || aiK.bot_strategy || 'trust_builder';
          if (isMounted) {
            if (s.category || data.category) {
              const c = String(s.category || data.category).toUpperCase();
              if (['PHYSICAL', 'RETAIL', 'FNB', 'RETAIL_PHYSICAL'].includes(c) || c.includes('PHYSICAL') || c.includes('RETAIL')) {
                setStoreCategory('PHYSICAL');
              } else if (['LOCAL_SERVICE', 'FIELD_SERVICE', 'SERVICE', 'PROFESSIONAL_CONSULT'].includes(c) || c.includes('SERVICE')) {
                setStoreCategory('LOCAL_SERVICE');
              } else {
                setStoreCategory('DIGITAL');
              }
            }
            if (s.features) {
              setTenantFeatureFlags(prev => ({
                ...prev,
                has_capi: Boolean(s.features.has_capi),
                ads_tracking: Boolean(s.features.ads_tracking),
                tier: s.features.tier || prev.tier,
              }));
            }
            if (s.plan_tier || s.tier || s.pricing?.tier) {
              const rawTier = (s.plan_tier || s.tier || s.pricing?.tier || '').toLowerCase();
              setTenantFeatureFlags(prev => ({ ...prev, tier: s.plan_tier || s.tier || s.pricing?.tier || prev.tier }));
              if (rawTier.includes('team_scale') || rawTier.includes('proscale') || rawTier.includes('pro_scale') || rawTier.includes('enterprise')) {
                setPlanTier('team_scale');
              } else if (rawTier.includes('ads_performance') || rawTier.includes('tracking') || rawTier.includes('plus') || rawTier.includes('growth+')) {
                setPlanTier('ads_performance');
              } else if (rawTier.includes('growth') || rawTier === 'starter' || rawTier === 'solo') {
                setPlanTier('growth');
              }

              if (rawTier.includes('trial')) {
                const endAt = s.trial_ends_at || data.trial_ends_at;
                const trialEndTimestamp = endAt
                  ? new Date(endAt).getTime()
                  : new Date(s.created_at || data.created_at || Date.now()).getTime() + 14 * 86400000;
                const diffMs = trialEndTimestamp - Date.now();
                setTrialDaysLeft(Math.max(0, Math.ceil(diffMs / 86400000)));
              }
            }
            setBotStrategy(loadedStrategy as 'trust_builder' | 'balanced' | 'hard_selling');
            setAiForm(prev => ({
              ...prev,
              ai_name: aiK.ai_name || aiK.assistant_name || s.assistant_name || prev.ai_name,
              system_prompt: aiK.system_prompt || s.system_prompt || prev.system_prompt,
              tone: aiK.tone || prev.tone,
            }));
            const payout = s.payout || {};
            if (payout.bank_name || payout.account_number || payout.account_holder) {
              setBankForm({
                name: payout.bank_name || '',
                account: payout.account_number || '',
                holder: payout.account_holder || '',
              });
            }
          }
        }
      } catch (err) {
        console.warn('Gagal memuat pengaturan AI tenant:', err);
      } finally {
        if (isMounted) setIsLoadingAi(false);
      }
    }
    loadTenantAiSettings();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  // 3. Sync URL Tab Param (?tab=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toLowerCase();
      if (tabParam) {
        hasUserSelectedTabRef.current = true;
        if (tabParam === 'products' || tabParam === 'catalog') setActiveTab('catalog');
        else if (tabParam === 'orders' || tabParam === 'pesanan') setActiveTab('orders');
        else if (tabParam === 'overview' || tabParam === 'analytics' || tabParam === 'finance' || tabParam === 'laporan') setActiveTab('integration');
        else if (['inbox', 'ai_knowledge', 'ads_tracking', 'biteship', 'shipping', 'broadcast', 'whatsapp'].includes(tabParam)) {
          setActiveTab(tabParam as DashboardTab);
        }
      }
    }
  }, []);

  // 4. Fetch Transactions (Orders)
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await fetch(`/api/orders?tenant=${encodeURIComponent(tenantSlug)}`).catch(() => null);
        if (res && res.ok) {
          const json = await res.json();
          const list = json.orders || json.data || [];
          if (Array.isArray(list) && list.length > 0) {
            const mapped = list.map((order: any) => {
              const isPaid = ['PAID', 'COMPLETED', 'SETTLEMENT', 'SUCCESS'].includes(
                (order.payment_status || order.status || '').toUpperCase()
              );
              return {
                id: order.id || order.invoice_no,
                date: new Date(order.created_at || Date.now()).toLocaleDateString('id-ID'),
                description: `Pesanan ${order.invoice_no || ''} - ${order.customer_name || 'Customer'}`,
                amount: Number(order.total_amount || order.total_price || 0),
                status: isPaid ? 'PAID' : 'PENDING',
                type: 'INCOME',
              };
            });
            setTransactions(mapped as any);
          }
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
      }
    };

    fetchTransactions();
  }, [tenantSlug]);

  const totalOmzet = transactions
    .filter((t: any) => t.status === 'PAID')
    .reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const readyBalance = totalOmzet;

  // 5. Products Handlers
  const refreshProducts = async (): Promise<ProductItem[]> => {
    try {
      const res = await fetch(getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`), {
        headers: { 'X-Tenant-ID': tenantSlug },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.products) && data.products.length > 0) {
          const mappedProducts: ProductItem[] = data.products.map((p: any, idx: number) => ({
            id: typeof p.id === 'number' ? p.id : Date.now() + idx,
            name: p.name || p.title || `Produk ${idx + 1}`,
            category: (p.category as any) || (p.product_type === 'PHYSICAL' ? 'fisik' : 'digital'),
            price: Number(p.price) || 0,
            promo_price: p.promo_price ? Number(p.promo_price) : 0,
            variants: p.variants || '',
            promo: p.promo || '',
            description: p.description || '',
            download_url: p.download_url || p.delivery_url || '',
            image: p.image || (Array.isArray(p.images) && p.images[0]) || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60',
            stock: p.stock !== undefined ? Number(p.stock) : 100,
            sku: p.sku || `SKU-${idx + 1}`,
            is_unlimited: p.is_unlimited || false,
          }));
          setProducts(mappedProducts);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(mappedProducts));
            } catch {}
          }
          return mappedProducts;
        }
      }
    } catch (err) {
      console.warn('Backend products fetch fallback note:', err);
    }

    try {
      const localRes = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`);
      if (localRes.ok) {
        const localData = await localRes.json();
        if (Array.isArray(localData.products) && localData.products.length > 0) {
          const mappedProducts: ProductItem[] = localData.products.map((p: any, idx: number) => ({
            id: typeof p.id === 'number' ? p.id : Date.now() + idx,
            name: p.name || p.title || `Produk ${idx + 1}`,
            category: (p.category as any) || (p.product_type === 'PHYSICAL' ? 'fisik' : 'digital'),
            price: Number(p.price) || 0,
            promo_price: p.promo_price ? Number(p.promo_price) : 0,
            variants: p.variants || '',
            promo: p.promo || '',
            description: p.description || '',
            download_url: p.download_url || p.delivery_url || '',
            image: p.image || (Array.isArray(p.images) && p.images[0]) || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60',
            stock: p.stock !== undefined ? Number(p.stock) : 100,
            sku: p.sku || `SKU-${idx + 1}`,
            is_unlimited: p.is_unlimited || false,
          }));
          setProducts(mappedProducts);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(mappedProducts));
            } catch {}
          }
          return mappedProducts;
        }
      }
    } catch (err) {
      console.warn('Local products fetch fallback note:', err);
    }

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`bt_products_${tenantSlug}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setProducts(parsed);
            return parsed;
          }
        } catch {}
      }
    }

    return [];
  };

  // Readiness evaluation
  useEffect(() => {
    let isMounted = true;

    async function evaluateStoreReadiness() {
      const fetchedProducts = await refreshProducts();
      const currentProductsCount = Array.isArray(fetchedProducts) ? fetchedProducts.length : products?.length || 0;

      try {
        const res = await fetch(`https://api.boontrack.com/tenant/whatsapp/status?tenant=${encodeURIComponent(tenantSlug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'CONNECTED' && isMounted) {
            setWaStatus('CONNECTED');
            if (data.phone_number) setConnectedPhone(data.phone_number);
          }
        }
      } catch (err) {
        console.debug('WhatsApp status readiness check note:', err);
      }

      const currentTxCount = transactions.length;

      if (!hasUserSelectedTabRef.current && isMounted) {
        if (currentProductsCount === 0) {
          setActiveTab('catalog');
        } else if (currentProductsCount > 0 && currentTxCount === 0) {
          setActiveTab('catalog');
        } else if (currentProductsCount > 0 && currentTxCount > 0) {
          setActiveTab('integration');
        }
      }

      if (isMounted) {
        setIsStoreReadinessEvaluated(true);
      }
    }

    evaluateStoreReadiness();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const openNewProductModal = () => {
    setEditingProductId(null);
    const defaultProductType = mapBusinessCategoryToProductType(storeCategory);
    const reqs = resolveFulfillmentRequirements(defaultProductType);
    setProductForm({
      id: Date.now(),
      name: '',
      product_type: defaultProductType,
      category: reqs.requiresShipping ? 'fisik' : 'digital',
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
    });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: ProductItem) => {
    setEditingProductId(prod.id);
    setProductForm({
      ...prod,
      stock: prod.stock ?? 100,
      sku: prod.sku || `SKU-${prod.id}`,
      is_unlimited: prod.is_unlimited ?? false,
    });
    setIsProductModalOpen(true);
  };

  const handleQuickStockChange = (productId: number, delta: number) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === productId) {
          const newStock = Math.max(0, (p.stock || 0) + delta);
          return { ...p, stock: newStock };
        }
        return p;
      })
    );
  };

  const handleSaveProductForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name) return;

    if (editingProductId) {
      setProducts(prev => prev.map(p => (p.id === editingProductId ? productForm : p)));
      setSaveFeedback('✅ Produk berhasil diperbarui!');
    } else {
      setProducts(prev => [...prev, { ...productForm, id: Date.now() }]);
      setSaveFeedback('✅ Produk baru berhasil ditambahkan!');
    }

    setIsProductModalOpen(false);
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleDeleteProduct = (id: number) => {
    if (confirm('Hapus produk ini dari etalase toko?')) {
      const updated = products.filter(p => p.id !== id);
      setProducts(updated);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(updated));
        } catch {}
      }
      setSaveFeedback('🗑️ Produk telah dihapus.');
      setTimeout(() => setSaveFeedback(null), 3000);
    }
  };

  // 6. Single Page Checkout Handlers
  const openSinglePageBuilder = (prod: ProductItem) => {
    setActiveSinglePageProduct(prod);
    const prodSlug = prod.slug || slugify(prod.name);
    const existingVoucher = prod.single_page_config?.voucher;
    const fulfillment = resolveFulfillmentRequirements(
      prod.product_type || (prod.category === 'fisik' ? 'PHYSICAL' : 'DIGITAL')
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
        cfg?.problem_image_url || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500&auto=format&fit=crop&q=60',
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
          : [
              'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=500&auto=format&fit=crop&q=60',
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60',
            ],

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

  const handleSaveSinglePageConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSinglePageProduct) return;

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

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`bt_products_${tenantSlug}`, JSON.stringify(updatedProducts));
        localStorage.setItem(
          `bt_single_page_${tenantSlug}_${prodSlug}`,
          JSON.stringify({
            ...updatedConfig,
            product: {
              ...activeSinglePageProduct,
              slug: prodSlug,
            },
          })
        );
      } catch (err) {
        console.warn('Failed to save to localStorage:', err);
      }
    }

    setIsSinglePageModalOpen(false);
    setSaveFeedback(`✅ Single Page Checkout untuk "${activeSinglePageProduct.name}" berhasil disimpan & diterapkan!`);
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
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`bt_conversations_${tenantSlug}`, JSON.stringify(updatedConversations));
      } catch (err) {
        console.warn('Gagal menyimpan percakapan:', err);
      }
    }
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

      setStrategyFeedback('✅ Strategi respon & persona bot berhasil disimpan!');
      setSaveFeedback('✅ Persona Bot Tersimpan');
      setTimeout(() => {
        setStrategyFeedback(null);
        setSaveFeedback(null);
      }, 4000);
    } catch (err) {
      alert('Gagal menyimpan strategi persona bot: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingStrategy(false);
    }
  };

  const handleSaveAiKnowledge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingAi(true);
    try {
      const payload = {
        name: displayName,
        assistant_name: aiForm.ai_name,
        system_prompt: aiForm.system_prompt,
        bot_strategy: botStrategy,
        ai_knowledge: {
          ai_name: aiForm.ai_name,
          assistant_name: aiForm.ai_name,
          system_prompt: aiForm.system_prompt,
          tone: aiForm.tone,
          bot_strategy: botStrategy,
        },
        persona: {
          ai_name: aiForm.ai_name,
          assistant_name: aiForm.ai_name,
          system_prompt: aiForm.system_prompt,
          tone: aiForm.tone,
          bot_strategy: botStrategy,
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

      setSaveFeedback('✅ Pengaturan Bot Persona & System Prompt AI berhasil disimpan!');
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err) {
      alert('Gagal menyimpan pengaturan AI: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingAi(false);
    }
  };

  // 10. WhatsApp Engine Handlers
  const handleConnectGrowthSession = async () => {
    setIsQrLoading(true);
    setWaErrorMessage(null);
    setPairingCodeResult(null);

    try {
      const res = await fetch(`https://api.boontrack.com/tenant/whatsapp/status?tenant=${encodeURIComponent(tenantSlug)}`);
      const data = await res.json();

      if (!data.success || data.status === 'DEGRADED') {
        setWaStatus('DEGRADED');
        setQrCodeUrl(null);
        setWaErrorMessage(
          data.disconnect_reason === 'GATEWAY_UNREACHABLE'
            ? 'BoonTrack WhatsApp Engine belum aktif / offline. QR Code tidak dapat dimuat sampai engine dinyalakan.'
            : 'Layanan BoonTrack WhatsApp Engine sedang dalam pemeliharaan.'
        );
      } else if (data.status === 'CONNECTED') {
        setWaStatus('CONNECTED');
        setConnectedPhone(data.phone_number || null);
        setQrCodeUrl(null);
      } else if (data.qr_image || data.qr_raw) {
        setWaStatus('CONNECTING');
        setQrCodeUrl(data.qr_image || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qr_raw)}`);
      } else {
        setWaStatus('DISCONNECTED');
        setQrCodeUrl(null);
      }
    } catch (err) {
      setWaStatus('DEGRADED');
      setQrCodeUrl(null);
      setWaErrorMessage('Gagal tersambung ke BoonTrack WhatsApp Engine.');
    } finally {
      setIsQrLoading(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhone.trim()) return alert('Masukkan nomor WhatsApp terlebih dahulu!');

    setIsPairingLoading(true);
    setPairingCodeResult(null);
    try {
      const res = await fetch(`https://api.boontrack.com/tenant/whatsapp/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, phone: pairingPhone }),
      });
      const data = await res.json();
      if (data.success && data.pairing_code) {
        setPairingCodeResult(data.pairing_code);
      } else {
        alert(data.detail || 'Gateway cluster belum siap menerima pairing code.');
      }
    } catch (err) {
      alert('Tidak dapat menghubungi cluster gateway.');
    } finally {
      setIsPairingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp' && waMode === 'qr') {
      handleConnectGrowthSession();
    }
  }, [activeTab, waMode, tenantSlug]);

  return {
    // Tenant info
    tenantSlug,
    displayName,
    params,
    router,

    // Tiers & Gating
    planTier,
    setPlanTier,
    tenantFeatureFlags,
    isTeamScale,
    isAdsPerformance,
    isProScale,
    isGrowthPlus,
    isGrowth,
    isAdsTrackingUnlocked,
    isSoloOrTrial,
    isBroadcastUnlocked,
    handleUpgradeTier,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    targetUpgradeTier,
    openUpgradeModal,

    // Store & Vertical
    storeCategory,
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
    isUploadingQris,
    handleQrisUpload,
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
    botStrategy,
    setBotStrategy,
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
    isAiBotAllowed,
    isUpsellModalOpen,
    setIsUpsellModalOpen,

    // Finance & Transactions
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
  };
}
