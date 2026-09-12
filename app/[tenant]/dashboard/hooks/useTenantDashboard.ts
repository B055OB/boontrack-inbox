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
import { getSupabase } from '@/lib/supabaseClient';
import { optimizeImageToWebP } from '@/components/ImageUpload';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import { mapProposalToAiForm } from '@/lib/boonpilotMapper';
import type { InteractiveMenu } from '@/lib/whatsappFormatter';

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
  const rawTenant = (params?.tenant as string) || '';
  const tenantSlug = rawTenant.toLowerCase();
  const displayName = tenantSlug.replace(/-/g, ' ');

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Dynamic Vertical Category
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

  // Plan Tier
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

  // State Profil Toko
  const [isStoreSettingsOpen, setIsStoreSettingsOpen] = useState(false);
  const [storeDisplayName, setStoreDisplayName] = useState(displayName || '');
  const [storeBio, setStoreBio] = useState('');
  const [storeWhatsapp, setStoreWhatsapp] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [storeQrisUrl, setStoreQrisUrl] = useState<string>('');
  const [isUploadingQris, setIsUploadingQris] = useState(false);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string>('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<DashboardTab>('catalog');
  const hasUserSelectedTabRef = useRef(false);
  const [isStoreReadinessEvaluated, setIsStoreReadinessEvaluated] = useState(false);

  const handleSelectTab = (tab: DashboardTab) => {
    hasUserSelectedTabRef.current = true;
    setActiveTab(tab);
  };

  // WhatsApp Gateway State (Strict Multi-Tenant)
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
    if (typeof window !== 'undefined' && tenantSlug) {
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
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
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
      let processedFile: File;
      try {
        processedFile = await optimizeImageToWebP(file);
      } catch {
        processedFile = file;
      }

      let publicUrl = '';

      try {
        const supabase = getSupabase();
        if (supabase) {
          const sanitizedName = (processedFile.name || 'qris.webp').replace(/[^a-zA-Z0-9.-]/g, '_');
          const storagePath = `${tenantSlug}/qris/${Date.now()}_${sanitizedName}`;
          const { data: sbData, error: sbErr } = await supabase.storage
            .from('store-assets')
            .upload(storagePath, processedFile, {
              contentType: processedFile.type || 'image/webp',
              upsert: true,
            });

          if (!sbErr && sbData) {
            const { data: pubData } = supabase.storage
              .from('store-assets')
              .getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              publicUrl = pubData.publicUrl;
            }
          }
        }
      } catch (directErr) {
        console.warn('Direct Supabase upload error:', directErr);
      }

      if (!publicUrl) {
        const formData = new FormData();
        formData.append('file', processedFile, processedFile.name);
        formData.append('image', processedFile, processedFile.name);
        formData.append('tenant_slug', tenantSlug);
        formData.append('tenant_id', tenantSlug);
        formData.append('folder', 'qris');

        try {
          const proxyRes = await fetch('/api/v1/upload', {
            method: 'POST',
            headers: {
              'X-Tenant-Slug': tenantSlug,
              'X-Tenant-ID': tenantSlug,
            },
            body: formData,
          });
          if (proxyRes.ok) {
            const uploadData = await proxyRes.json();
            publicUrl =
              uploadData?.url ||
              uploadData?.image_url ||
              uploadData?.public_url ||
              uploadData?.file_url ||
              (typeof uploadData === 'string' ? uploadData : '');
          }
        } catch (proxyErr) {
          console.warn('Fallback upload proxy error:', proxyErr);
        }
      }

      if (!publicUrl) {
        throw new Error('Gagal mengunggah gambar QRIS ke storage');
      }

      setStoreQrisUrl(publicUrl);

      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qris_image_url: publicUrl }),
        });
      } catch (settingsErr) {
        console.warn('Gagal sync qris_image_url via settings route:', settingsErr);
      }

      setSaveFeedback('✅ Gambar QRIS berhasil disimpan!');
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
      let processedFile: File;
      try {
        processedFile = await optimizeImageToWebP(file, 600, 600, 0.9);
      } catch {
        processedFile = file;
      }

      let publicUrl = '';

      try {
        const supabase = getSupabase();
        if (supabase) {
          const sanitizedName = (processedFile.name || 'logo.webp').replace(/[^a-zA-Z0-9.-]/g, '_');
          const storagePath = `${tenantSlug}/logos/${Date.now()}_${sanitizedName}`;
          const { data: sbData, error: sbErr } = await supabase.storage
            .from('store-assets')
            .upload(storagePath, processedFile, {
              contentType: processedFile.type || 'image/webp',
              upsert: true,
            });

          if (!sbErr && sbData) {
            const { data: pubData } = supabase.storage
              .from('store-assets')
              .getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              publicUrl = pubData.publicUrl;
            }
          }
        }
      } catch (directErr) {
        console.warn('Direct Supabase upload error:', directErr);
      }

      if (!publicUrl) {
        throw new Error('Gagal mengunggah logo ke storage');
      }

      setStoreLogoUrl(publicUrl);

      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo_url: publicUrl }),
        });
      } catch { }

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
          if (tenant.metadata?.bio) setStoreBio(tenant.metadata.bio);
          const qrisUrlFromDb =
            tenant.metadata?.qris_image_url ||
            tenant.metadata?.qris_url ||
            tenant.qris_image_url ||
            '';
          if (qrisUrlFromDb) setStoreQrisUrl(qrisUrlFromDb);
          const logoUrlFromDb = tenant.metadata?.logo_url || tenant.logo_url || '';
          if (logoUrlFromDb) setStoreLogoUrl(logoUrlFromDb);

          // Hydrate Products
          const metaProducts = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
          if (metaProducts.length > 0) {
            const mapped = metaProducts.map((p: any, idx: number) => ({
              id: typeof p.id === 'number' ? p.id : Date.now() + idx,
              name: p.name || p.title || `Produk ${idx + 1}`,
              slug: p.slug || p.single_page_config?.slug || slugify(p.name || p.title || `produk-${idx + 1}`),
              category: (p.category as any) || (p.product_type === 'PHYSICAL' ? 'fisik' : 'digital'),
              product_type: p.product_type || (p.category === 'fisik' ? 'PHYSICAL' : 'DIGITAL'),
              price: Number(p.price) || 0,
              promo_price: p.promo_price ? Number(p.promo_price) : 0,
              variants: p.variants || '',
              promo: p.promo || '',
              description: p.description || '',
              download_url: p.download_url || p.delivery_url || p.link_digital || '',
              image: p.image || (Array.isArray(p.images) && p.images[0]) || p.image_url || '',
              stock: p.stock !== undefined ? Number(p.stock) : 100,
              sku: p.sku || `SKU-${idx + 1}`,
              is_unlimited: p.is_unlimited || false,
              weight_grams: p.weight_grams,
              fulfillment_metadata: p.fulfillment_metadata,
              single_page_config: p.single_page_config,
            }));
            setProducts(mapped);
          }

          // Category
          const rawCat = (tenant.category || tenant.metadata?.vertical_type || tenant.metadata?.business_category || 'PHYSICAL').toUpperCase();
          if (['PHYSICAL', 'RETAIL', 'FNB', 'RETAIL_PHYSICAL'].includes(rawCat) || rawCat.includes('PHYSICAL') || rawCat.includes('RETAIL')) {
            setStoreCategory('PHYSICAL');
          } else if (['LOCAL_SERVICE', 'FIELD_SERVICE', 'SERVICE', 'PROFESSIONAL_CONSULT'].includes(rawCat) || rawCat.includes('SERVICE') || rawCat.includes('LOCAL')) {
            setStoreCategory('LOCAL_SERVICE');
          } else {
            setStoreCategory('DIGITAL');
          }

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
          if (s.logo_url) setStoreLogoUrl(s.logo_url);
          if (s.bio) setStoreBio(s.bio);
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
            if (Array.isArray(s.interactive_menus) && s.interactive_menus.length > 0) setInteractiveMenus(s.interactive_menus);
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
        if (tabParam === 'products' || tabParam === 'catalog') setActiveTab('catalog');
        else if (tabParam === 'orders' || tabParam === 'pesanan') setActiveTab('orders');
        else if (tabParam === 'overview' || tabParam === 'analytics' || tabParam === 'finance' || tabParam === 'laporan') setActiveTab('integration');
        else if (['inbox', 'ai_knowledge', 'ads_tracking', 'biteship', 'shipping', 'broadcast', 'whatsapp'].includes(tabParam)) {
          setActiveTab(tabParam as DashboardTab);
        }
      }
    }
  }, []);

  // 4. Fetch Transactions
  useEffect(() => {
    if (!tenantSlug) return;
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
          if (data.status === 'CONNECTED' && isMounted) {
            setWaStatus('CONNECTED');
            if (data.connected_phone) setConnectedPhone(data.connected_phone);
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
    setEditingProductId(null);
    const defaultProductType = mapBusinessCategoryToProductType(storeCategory);
    const reqs = resolveFulfillmentRequirements(defaultProductType);
    setProductForm({
      id: Date.now(),
      name: '',
      slug: '',
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
    const prodSlug = prod.slug || prod.single_page_config?.slug || slugify(prod.name);
    setProductForm({
      ...prod,
      slug: prodSlug,
      stock: prod.stock ?? 100,
      sku: prod.sku || `SKU-${prod.id}`,
      is_unlimited: prod.is_unlimited ?? false,
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

    const finalSlug = (productForm.slug?.trim() || slugify(productForm.name)).toLowerCase();
    const updatedProductItem: ProductItem = {
      ...productForm,
      slug: finalSlug,
      single_page_config: productForm.single_page_config
        ? {
          ...productForm.single_page_config,
          slug: finalSlug,
        }
        : undefined,
    };

    let updatedProducts: ProductItem[];
    if (editingProductId) {
      updatedProducts = products.map(p => (p.id === editingProductId ? updatedProductItem : p));
      setProducts(updatedProducts);
      setSaveFeedback('✅ Produk berhasil diperbarui!');
    } else {
      const newProd = { ...updatedProductItem, id: updatedProductItem.id || Date.now() };
      updatedProducts = [newProd, ...products];
      setProducts(updatedProducts);
      setSaveFeedback('✅ Produk baru berhasil ditambahkan!');
    }

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
        faqs,
        interactive_menus: interactiveMenus,
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
  const handleConnectGrowthSession = async () => {
    if (!tenantSlug) return;
    setIsQrLoading(true);
    setWaErrorMessage(null);
    setPairingCodeResult(null);

    try {
      const res = await fetch(`/api/whatsapp/connect?tenant=${encodeURIComponent(tenantSlug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));

      if (data.status === 'CONNECTED') {
        setWaStatus('CONNECTED');
        setConnectedPhone(data.connected_phone || data.phone_number || null);
        setQrCodeUrl(null);
        setWaErrorMessage(null);
      } else {
        setWaStatus('CONNECTING');
        // Tangkap string gambar base64 murni dari respons Evolution API
        const qr = data.base64 || data.qr_image || data.qrcode?.base64 || null;
        if (qr) {
          setQrCodeUrl(qr);
        }
        if (data.code && !pairingCodeResult) {
          setPairingCodeResult(data.code);
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

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug) return;
    if (!pairingPhone.trim()) return alert('Masukkan nomor WhatsApp terlebih dahulu!');

    setIsPairingLoading(true);
    setPairingCodeResult(null);
    try {
      let cleanPhone = pairingPhone.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '62' + cleanPhone.slice(1);
      } else if (!cleanPhone.startsWith('62')) {
        cleanPhone = '62' + cleanPhone;
      }

      const res = await fetch(`/api/whatsapp/pairing-code?tenant=${encodeURIComponent(tenantSlug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, phone: cleanPhone }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.pairing_code) {
        const rawCode = String(data.pairing_code).trim();
        if (rawCode.includes('@') || rawCode.includes('=') || rawCode.length > 12) {
          alert('Respons gateway berupa raw QR code, bukan kode pairing. Silakan gunakan Scan QR Barcode di sebelah kanan.');
          setPairingCodeResult(null);
        } else {
          setPairingCodeResult(rawCode);
        }
      } else {
        alert(data.error || data.detail || 'Gagal mendapatkan kode pairing dari server WhatsApp.');
        setPairingCodeResult(null);
      }
    } catch (err) {
      alert('Tidak dapat menghubungi gateway WhatsApp.');
      setPairingCodeResult(null);
    } finally {
      setIsPairingLoading(false);
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