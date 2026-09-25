'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Package, X, Save, Link as LinkIcon, RefreshCw, ExternalLink, Sparkles, Zap, Plus, Trash2, Tag, CreditCard } from 'lucide-react';
import BoonPilotPitchModal from './BoonPilotPitchModal';
import ImageUpload from '@/components/ImageUpload';
import {
  ProductItem,
  ProductType,
  resolveFulfillmentRequirements,
  FulfillmentMetadata,
  slugify,
  OrderBumpItem,
  OrderBumpConfig,
  ProductVoucherConfig,
  resolveProductDefaultCta,
} from '@/lib/product-catalog';
import { sanitizeImageUrl } from '@/lib/image-utils';
import { ModularProductFormDispatcher, resolveDomainVertical } from './modules';
import { getSupabase } from '@/lib/supabaseClient';

export type BoonVerticalOption =
  | 'retail_physical'
  | 'digital_product'
  | 'fnb'
  | 'field_service'
  | 'pro_service'
  | 'creator_agency';

export interface BoonVerticalMeta {
  key: BoonVerticalOption;
  label: string;
  productType: ProductType;
  backendType: 'physical' | 'digital' | 'fnb' | 'service';
  defaultBadge: string;
  description: string;
}

export const BOON_VERTICAL_OPTIONS: BoonVerticalMeta[] = [
  {
    key: 'retail_physical',
    label: 'Retail & Produk Fisik',
    productType: 'PHYSICAL',
    backendType: 'physical',
    defaultBadge: 'Fisik',
    description: 'Wajib alamat pengiriman & kalkulasi ongkir kurir ekspedisi.',
  },
  {
    key: 'digital_product',
    label: 'Produk Digital (File / E-course / Akses)',
    productType: 'DIGITAL',
    backendType: 'digital',
    defaultBadge: 'Digital',
    description: 'Checkout kilat & pengiriman payload akses otomatis saat lunas.',
  },
  {
    key: 'fnb',
    label: 'Kuliner & F&B',
    productType: 'FOOD',
    backendType: 'fnb',
    defaultBadge: 'Kuliner & F&B',
    description: 'Pengiriman instan/kargo makanan dengan alamat tujuan.',
  },
  {
    key: 'field_service',
    label: 'Layanan Jasa Lapangan',
    productType: 'FIELD_SERVICE',
    backendType: 'service',
    defaultBadge: 'Jasa Lapangan',
    description: 'Reservasi jadwal kunjungan teknisi/tim ke lokasi pelanggan.',
  },
  {
    key: 'pro_service',
    label: 'Jasa Profesional & Konsultasi',
    productType: 'PROFESSIONAL_SERVICE',
    backendType: 'service',
    defaultBadge: 'Konsultasi',
    description: 'Sesi konsultasi, booking kalender, atau audit profesional.',
  },
  {
    key: 'creator_agency',
    label: 'Layanan Agency & Kreator',
    productType: 'AGENCY',
    backendType: 'service',
    defaultBadge: 'Agency & Kreator',
    description: 'Paket retainer, brief proyek, dan koordinasi tim agency.',
  },
];

export function resolveBoonVertical(
  product: Partial<ProductItem>,
  storeCategory?: string
): BoonVerticalOption {
  // Store category from tenant is the primary source of truth for the store's vertical
  const sc = (storeCategory || '').toUpperCase();
  if (['FOOD', 'FNB', 'KULINER'].some((k) => sc.includes(k))) return 'fnb';
  if (['DIGITAL', 'COURSE', 'SOFTWARE'].some((k) => sc.includes(k))) return 'digital_product';
  if (['PROFESSIONAL', 'CONSULT'].some((k) => sc.includes(k))) return 'pro_service';
  if (['AGENCY', 'CREATOR'].some((k) => sc.includes(k))) return 'creator_agency';
  if (['SERVICE', 'FIELD', 'LOCAL'].some((k) => sc.includes(k))) return 'field_service';
  if (['PHYSICAL', 'RETAIL'].some((k) => sc.includes(k))) return 'retail_physical';

  // Fallback to product attributes if storeCategory is not specified
  const pt = (product.product_type || '').toUpperCase();
  if (pt === 'FOOD' || pt === 'FNB') return 'fnb';
  if (pt === 'DIGITAL') return 'digital_product';
  if (pt === 'FIELD_SERVICE') return 'field_service';
  if (pt === 'PROFESSIONAL_SERVICE') return 'pro_service';
  if (pt === 'AGENCY') return 'creator_agency';
  if (pt === 'PHYSICAL') return 'retail_physical';

  const rawType = (product.type || '').toLowerCase();
  const rawCat = (product.category || '').toLowerCase();

  if (rawCat === 'kuliner & f&b' || rawCat === 'fnb' || rawCat === 'food' || rawType === 'fnb') return 'fnb';
  if (rawCat === 'digital' || rawType === 'digital') return 'digital_product';
  if (rawCat === 'konsultasi' || rawCat === 'pro_service') return 'pro_service';
  if (rawCat === 'agency & kreator' || rawCat === 'creator_agency') return 'creator_agency';
  if (rawCat === 'jasa lapangan' || rawCat === 'field_service' || rawCat === 'jasa' || rawCat === 'service' || rawType === 'service') {
    return 'field_service';
  }
  if (rawCat === 'fisik' || rawCat === 'physical' || rawType === 'physical') return 'retail_physical';

  return 'retail_physical';
}

export function mapBusinessCategoryToProductType(storeCategory?: string): ProductType {
  const cat = (storeCategory || '').toUpperCase();
  if (['FOOD', 'FNB', 'KULINER', 'RESTO', 'MAKANAN'].some((k) => cat.includes(k))) return 'FOOD';
  if (['DIGITAL', 'COURSE', 'SOFTWARE', 'CREATOR_SERVICE', 'KONTEN'].some((k) => cat.includes(k))) return 'DIGITAL';
  if (['PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'ACCOUNTING', 'PRO_SERVICE', 'TRAVEL', 'UMROH'].some((k) => cat.includes(k))) return 'PROFESSIONAL_SERVICE';
  if (['FIELD_SERVICE', 'LOCAL_SERVICE', 'REPAIR', 'LAUNDRY', 'SALON', 'JASA_LAPANGAN', 'SERVICE', 'JASA'].some((k) => cat.includes(k))) return 'FIELD_SERVICE';
  if (['AGENCY', 'MARKETING_AGENCY', 'DEV_AGENCY', 'CREATOR'].some((k) => cat.includes(k))) return 'AGENCY';
  return 'PHYSICAL';
}

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  editingProductId: number | string | null;
  storeCategory?: string;
  tenantSlug?: string;
  isCheckoutLite?: boolean;
  activeProductsCount?: number;
}

export default function ProductFormModal({
  isOpen,
  onClose,
  onSave,
  productForm,
  setProductForm,
  editingProductId,
  storeCategory,
  tenantSlug,
  isCheckoutLite = false,
  activeProductsCount = 0,
}: ProductFormModalProps) {
  const [isPitchModalOpen, setIsPitchModalOpen] = useState(false);

  // Sync vertical option when modal opens
  useEffect(() => {
    if (isOpen) {
      setProductForm((prev) => {
        const vertical = resolveBoonVertical(prev, storeCategory);
        const meta = BOON_VERTICAL_OPTIONS.find((o) => o.key === vertical) || BOON_VERTICAL_OPTIONS[0];
        const reqs = resolveFulfillmentRequirements(meta.productType);
        const currentSlug = prev.slug?.trim() || (prev.name ? slugify(prev.name) : '');
        const customBadge = prev.custom_badge?.trim();
        const resolvedBadge = customBadge || (prev.category?.trim() && !['fisik', 'jasa', 'digital', 'service', 'physical'].includes(prev.category.trim().toLowerCase()) ? prev.category.trim() : meta.defaultBadge);

        const effectiveDomain = resolveDomainVertical(storeCategory || vertical || meta.productType);
        const isPhysicalStock = effectiveDomain === 'physical-retail' || effectiveDomain === 'fnb-culinary';

        return {
          ...prev,
          image: sanitizeImageUrl(prev.image),
          slug: currentSlug,
          product_type: meta.productType,
          type: meta.backendType,
          category: resolvedBadge,
          custom_badge: customBadge || (resolvedBadge !== meta.defaultBadge ? resolvedBadge : undefined),
          is_unlimited: !isPhysicalStock ? true : (prev.is_unlimited !== undefined ? prev.is_unlimited : reqs.strategy === 'DIGITAL'),
          stock: !isPhysicalStock ? 999999 : (prev.stock ?? 100),
          weight_grams: !isPhysicalStock ? 0 : (prev.weight_grams ?? 0),
          checkout_type: prev.checkout_type || (prev.external_url ? 'external' : 'internal'),
          external_url: prev.external_url || '',
          cta_label: prev.cta_label || '',
        };
      });
    }
  }, [isOpen, storeCategory, editingProductId, setProductForm]);

  const currentVerticalKey = resolveBoonVertical(productForm, storeCategory);
  const activeVerticalMeta = BOON_VERTICAL_OPTIONS.find((o) => o.key === currentVerticalKey) || BOON_VERTICAL_OPTIONS[0];

  const currentType: ProductType = productForm.product_type || activeVerticalMeta.productType;
  const requirements = resolveFulfillmentRequirements(currentType);

  const effectiveVertical = resolveDomainVertical(storeCategory || currentVerticalKey || currentType);
  const isPhysicalStockVertical = effectiveVertical === 'physical-retail' || effectiveVertical === 'fnb-culinary';

  const isServiceCluster = currentVerticalKey === 'field_service' || currentVerticalKey === 'pro_service' || currentVerticalKey === 'creator_agency' || activeVerticalMeta.backendType === 'service';
  const isDigitalCluster = currentVerticalKey === 'digital_product' || activeVerticalMeta.backendType === 'digital';

  const metadata: FulfillmentMetadata = productForm.fulfillment_metadata || {
    delivery_type: isServiceCluster ? 'WHATSAPP_GROUP' : 'DOWNLOAD_LINK',
    access_url: productForm.download_url || '',
    instructions: '',
  };

  const handleCustomBadgeChange = (val: string) => {
    setProductForm((prev) => {
      const meta = BOON_VERTICAL_OPTIONS.find((o) => o.key === currentVerticalKey) || BOON_VERTICAL_OPTIONS[0];
      const trimmed = val.trim();
      return {
        ...prev,
        custom_badge: val,
        category: trimmed || meta.defaultBadge,
      };
    });
  };

  const handleMetadataChange = (key: keyof FulfillmentMetadata, value: string) => {
    setProductForm((prev) => {
      const updatedMeta: FulfillmentMetadata = {
        ...(prev.fulfillment_metadata || {}),
        [key]: value,
      };
      return {
        ...prev,
        fulfillment_metadata: updatedMeta,
        download_url: key === 'access_url' ? value : prev.download_url,
      };
    });
  };

  // Resolve string for Materi & Fasilitas Utama
  const facilitiesString = useMemo(() => {
    if (typeof productForm.facilities === 'string') return productForm.facilities;
    if (Array.isArray(productForm.facilities)) return productForm.facilities.join('\n');
    if (typeof productForm.features === 'string') return productForm.features;
    if (Array.isArray(productForm.features)) return productForm.features.join('\n');
    if (Array.isArray(productForm.single_page_config?.solution_points)) {
      return productForm.single_page_config.solution_points.join('\n');
    }
    const metaPts = productForm.metadata?.facilities || productForm.metadata?.features || productForm.metadata?.solution_points;
    if (Array.isArray(metaPts)) return metaPts.join('\n');
    if (typeof metaPts === 'string') return metaPts;
    return '';
  }, [productForm.facilities, productForm.features, productForm.single_page_config, productForm.metadata]);

  const handleFacilitiesChange = (val: string) => {
    const pointsArray = val
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    setProductForm((prev) => {
      const currentConfig = prev.single_page_config || ({} as any);
      const currentMeta = prev.metadata || {};
      return {
        ...prev,
        facilities: pointsArray,
        features: pointsArray,
        single_page_config: {
          ...currentConfig,
          solution_points: pointsArray,
          solution_title: currentConfig.solution_title || 'Materi & Fasilitas Utama',
        },
        metadata: {
          ...currentMeta,
          facilities: pointsArray,
          features: pointsArray,
          solution_points: pointsArray,
        },
      };
    });
  };

  // ── ORDER BUMP / CROSS-SELLING STATE & HANDLERS ──
  const [orderBumpsEnabled, setOrderBumpsEnabled] = useState(false);
  const [orderBumpItems, setOrderBumpItems] = useState<OrderBumpItem[]>([]);
  const [availableStoreProducts, setAvailableStoreProducts] = useState<Array<{ id: string | number; name: string; price: number; promo_price?: number; description?: string }>>([]);

  // Fetch available store products for optional prefill
  useEffect(() => {
    let isMounted = true;
    async function fetchStoreProducts() {
      if (!isOpen || !tenantSlug) return;
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();
          const prods = data?.metadata?.products;
          if (Array.isArray(prods) && isMounted) {
            setAvailableStoreProducts(
              prods.filter((p: any) => p && String(p.id) !== String(editingProductId))
            );
          }
        }
      } catch {}
    }
    fetchStoreProducts();
    return () => {
      isMounted = false;
    };
  }, [isOpen, tenantSlug, editingProductId]);

  // Sync order bumps from productForm when modal opens
  useEffect(() => {
    if (isOpen) {
      const raw = productForm.order_bumps || productForm.metadata?.order_bumps || productForm.fulfillment_metadata?.order_bumps;
      if (!raw) {
        setOrderBumpsEnabled(false);
        setOrderBumpItems([]);
      } else if (Array.isArray(raw)) {
        setOrderBumpsEnabled(raw.length > 0 && raw.some((i: any) => i.is_active !== false));
        setOrderBumpItems(raw as OrderBumpItem[]);
      } else if (typeof raw === 'object') {
        const isEnabled = Boolean(raw.enabled);
        const items = Array.isArray(raw.items) ? (raw.items as OrderBumpItem[]) : [];
        setOrderBumpsEnabled(isEnabled);
        setOrderBumpItems(items);
      }
    }
  }, [isOpen, editingProductId]);

  const syncBumpConfigToForm = (enabled: boolean, items: OrderBumpItem[]) => {
    const config: OrderBumpConfig = {
      enabled,
      items,
    };
    setProductForm((prev) => ({
      ...prev,
      order_bumps: config,
      metadata: {
        ...(prev.metadata || {}),
        order_bumps: config,
      },
      fulfillment_metadata: {
        ...(prev.fulfillment_metadata || {}),
        order_bumps: config,
      },
    }));
  };

  const handleToggleMasterOrderBumps = (enabled: boolean) => {
    setOrderBumpsEnabled(enabled);
    let items = [...orderBumpItems];
    if (enabled && items.length === 0) {
      items = [
        {
          id: `bump_${Date.now()}`,
          name: '',
          price: 0,
          original_price: undefined,
          badge_text: 'Penawaran Spesial',
          description: '',
          is_active: true,
        },
      ];
      setOrderBumpItems(items);
    }
    syncBumpConfigToForm(enabled, items);
  };

  const handleAddBumpItem = () => {
    const newItem: OrderBumpItem = {
      id: `bump_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: '',
      price: 0,
      original_price: undefined,
      badge_text: 'Penawaran Spesial',
      description: '',
      is_active: true,
    };
    const updated = [...orderBumpItems, newItem];
    setOrderBumpItems(updated);
    syncBumpConfigToForm(orderBumpsEnabled, updated);
  };

  const handleUpdateBumpItem = (index: number, patch: Partial<OrderBumpItem>) => {
    const updated = orderBumpItems.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setOrderBumpItems(updated);
    syncBumpConfigToForm(orderBumpsEnabled, updated);
  };

  const handleRemoveBumpItem = (index: number) => {
    const updated = orderBumpItems.filter((_, i) => i !== index);
    setOrderBumpItems(updated);
    const newEnabled = updated.length > 0 ? orderBumpsEnabled : false;
    if (updated.length === 0) setOrderBumpsEnabled(false);
    syncBumpConfigToForm(newEnabled, updated);
  };

  // ── UNIVERSAL CTA BUTTON TEXT RESOLUTION & HANDLER ──
  const smartDefaultCta = resolveProductDefaultCta({
    product_type: currentType,
    type: activeVerticalMeta.backendType,
    category: productForm.category,
    name: productForm.name,
  });

  const ctaTextValue = productForm.metadata?.cta_text || productForm.cta_label || '';

  const handleCtaTextChange = (val: string) => {
    setProductForm((prev) => {
      const currentMeta = prev.metadata || {};
      const currentSpc = prev.single_page_config || ({} as any);
      return {
        ...prev,
        cta_label: val,
        button_text: val,
        single_page_config: {
          ...currentSpc,
          cta_label: val,
        },
        metadata: {
          ...currentMeta,
          cta_text: val,
          cta_label: val,
        },
      };
    });
  };

  // ── DECOUPLED VOUCHER & PAYMENT METHODS STATE & HANDLERS ──
  const [voucherEnabled, setVoucherEnabled] = useState(false);
  const [voucherForm, setVoucherForm] = useState<ProductVoucherConfig>({
    is_enabled: false,
    code: '',
    discount_type: 'nominal',
    discount_value: 20000,
    min_spend: 0,
    shipping_discount_type: 'none',
    shipping_discount_value: 0,
  });

  const [paymentMethods, setPaymentMethods] = useState({
    enable_qris: true,
    enable_manual_transfer: true,
  });

  useEffect(() => {
    if (isOpen) {
      const rawV = productForm.metadata?.voucher_config || productForm.single_page_config?.voucher;
      const enabled = Boolean(
        productForm.metadata?.voucher_config?.is_enabled ??
        productForm.single_page_config?.voucher?.is_enabled ??
        (rawV && rawV.code && rawV.discount_value > 0)
      );
      setVoucherEnabled(enabled);
      setVoucherForm({
        is_enabled: enabled,
        code: rawV?.code || productForm.single_page_config?.discount_coupon || '',
        discount_type: rawV?.discount_type || 'nominal',
        discount_value: rawV?.discount_value ?? 20000,
        min_spend: rawV?.min_spend ?? 0,
        shipping_discount_type: rawV?.shipping_discount_type || 'none',
        shipping_discount_value: rawV?.shipping_discount_value ?? 0,
      });

      const pm = productForm.metadata?.payment_methods;
      setPaymentMethods({
        enable_qris: productForm.single_page_config?.enable_qris ?? pm?.enable_qris ?? true,
        enable_manual_transfer: productForm.single_page_config?.enable_manual_transfer ?? pm?.enable_manual_transfer ?? true,
      });
    }
  }, [isOpen, editingProductId]);

  const syncVoucherToProductForm = (enabled: boolean, vCfg: ProductVoucherConfig) => {
    const updatedVoucher: ProductVoucherConfig = {
      ...vCfg,
      is_enabled: enabled,
    };
    setProductForm((prev) => {
      const currentMeta = prev.metadata || {};
      const currentSpc = prev.single_page_config || ({} as any);
      return {
        ...prev,
        metadata: {
          ...currentMeta,
          voucher_config: updatedVoucher,
        },
        single_page_config: {
          ...currentSpc,
          discount_coupon: enabled ? updatedVoucher.code : '',
          voucher: {
            code: updatedVoucher.code,
            discount_type: updatedVoucher.discount_type,
            discount_value: updatedVoucher.discount_value,
            shipping_discount_type: updatedVoucher.shipping_discount_type,
            shipping_discount_value: updatedVoucher.shipping_discount_value,
            min_spend: updatedVoucher.min_spend,
            is_enabled: enabled,
          },
        },
      };
    });
  };

  const syncPaymentMethodsToProductForm = (pm: { enable_qris: boolean; enable_manual_transfer: boolean }) => {
    setProductForm((prev) => {
      const currentMeta = prev.metadata || {};
      const currentSpc = prev.single_page_config || ({} as any);
      return {
        ...prev,
        metadata: {
          ...currentMeta,
          payment_methods: pm,
        },
        single_page_config: {
          ...currentSpc,
          enable_qris: pm.enable_qris,
          enable_manual_transfer: pm.enable_manual_transfer,
        },
      };
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isAffiliate = productForm.checkout_type === 'external';
    if (!isPhysicalStockVertical || isAffiliate) {
      setProductForm((p) => ({
        ...p,
        is_unlimited: true,
        stock: 999999,
        weight_grams: 0,
      }));
    }

    if (isCheckoutLite && !editingProductId && activeProductsCount >= 3) {
      alert('Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.');
      return;
    }

    onSave(e);
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span>{editingProductId ? 'Edit Produk' : 'Tambah Produk Baru'}</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPitchModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-[11px] font-black transition cursor-pointer shadow-sm shadow-violet-500/20"
              title="Generate deskripsi & copy produk dengan BoonPilot AI"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>BoonPilot</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Quota Limit Warning Banner for Checkout Lite */}
          {isCheckoutLite && !editingProductId && activeProductsCount >= 3 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-medium space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-950">
                <span>⚠️</span>
                <span>Batas Kuota Tercapai</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.
              </p>
            </div>
          )}

          {/* 1. Nama Produk */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Nama Produk / Layanan *
            </label>
            <input
              type="text"
              required
              value={productForm.name}
              onChange={(e) => {
                const newName = e.target.value;
                setProductForm((p) => {
                  const shouldSyncSlug = !editingProductId && (!p.slug || p.slug === slugify(p.name));
                  const updatedSlug = shouldSyncSlug ? slugify(newName) : p.slug;
                  return {
                    ...p,
                    name: newName,
                    slug: updatedSlug,
                    single_page_config: p.single_page_config
                      ? { ...p.single_page_config, slug: updatedSlug }
                      : undefined,
                  };
                });
              }}
              placeholder="Contoh: Ecourse Ads Masterclass 2026 / Paket Kopi Arabika"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white font-medium"
            />
          </div>

          {/* 1b. Slug URL Salespage */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>URL / Slug Salespage Produk *</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const generated = slugify(productForm.name || 'produk');
                  setProductForm((p) => ({
                    ...p,
                    slug: generated,
                    single_page_config: p.single_page_config
                      ? { ...p.single_page_config, slug: generated }
                      : undefined,
                  }));
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-100/60 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                title="Sinkronkan slug dengan judul produk terbaru"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sinkronkan URL dengan Judul Baru</span>
              </button>
            </div>
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="text-slate-400 shrink-0 font-medium">/{tenantSlug || 'store'}/p/</span>
              <input
                type="text"
                required
                value={productForm.slug || ''}
                onChange={(e) => {
                  const s = slugify(e.target.value);
                  setProductForm((p) => ({
                    ...p,
                    slug: s,
                    single_page_config: p.single_page_config
                      ? { ...p.single_page_config, slug: s }
                      : undefined,
                  }));
                }}
                placeholder="nama-slug-produk"
                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-blue-600 font-mono"
              />
            </div>
            <p className="text-[10px] text-slate-400 font-sans">
              Akses publik: <code className="text-blue-600 font-bold font-mono">https://shop.boontrack.com/{tenantSlug || 'store'}/p/{productForm.slug || slugify(productForm.name || 'produk')}</code>
            </p>
          </div>

          {/* 2. Kategori / Label Produk (Opsional) - Full Width */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Kategori / Label Produk (Opsional)
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Badge default: <strong className="text-blue-600 font-bold">"{activeVerticalMeta.defaultBadge}"</strong>
              </span>
            </div>
            <input
              type="text"
              value={productForm.custom_badge || ''}
              onChange={(e) => handleCustomBadgeChange(e.target.value)}
              placeholder="Contoh: Cuci AC, Kuras Toren, Aksesoris, dsb. (Biarkan kosong untuk label default)"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-600 shadow-xs"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Badge etalase: <strong className="text-slate-700">{productForm.custom_badge?.trim() || activeVerticalMeta.defaultBadge}</strong>
              </span>
              <span className="text-[10px] text-slate-400">
                Vertikal toko: <span className="text-slate-600 font-semibold">{activeVerticalMeta.label}</span>
              </span>
            </div>
          </div>

          {/* 3. Harga Normal & Promo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Harga Normal (Rp) *
                </label>
                <span className="text-[10px] text-slate-500 font-medium">
                  (Isi 0 jika Gratis)
                </span>
              </div>
              <input
                type="number"
                min="0"
                required
                value={productForm.price !== undefined && productForm.price !== null ? productForm.price : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductForm((p) => ({ ...p, price: val === '' ? 0 : Number(val) }));
                }}
                placeholder="Contoh: 250000 atau 0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Harga Promo (Rp)
              </label>
              <input
                type="number"
                min="0"
                value={productForm.promo_price !== undefined && productForm.promo_price !== null && productForm.promo_price > 0 ? productForm.promo_price : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductForm((p) => ({ ...p, promo_price: val === '' ? undefined : Number(val) }));
                }}
                placeholder="Opsional (harga coret)"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {/* 3b. Tipe Transaksi / Alur Checkout (BoonTrack vs Affiliate Eksternal) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>Tipe Transaksi / Alur Checkout</span>
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                {productForm.checkout_type === 'external' ? 'Mitra / Affiliate' : 'BoonTrack Internal'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProductForm((p) => ({ ...p, checkout_type: 'internal' }))}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  (productForm.checkout_type || 'internal') === 'internal'
                    ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 text-blue-950'
                    : 'bg-white border-slate-200 hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">BoonTrack Checkout</span>
                  {(productForm.checkout_type || 'internal') === 'internal' && (
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  Checkout standar via QRIS / VA langsung di toko BoonTrack Anda.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProductForm((p) => ({ ...p, checkout_type: 'external' }))}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  productForm.checkout_type === 'external'
                    ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 text-purple-950'
                    : 'bg-white border-slate-200 hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Link Eksternal / Affiliate</span>
                  {productForm.checkout_type === 'external' && (
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  Produk Affiliate / Mitra Luar (Shopee, TikTok, Mayar, Sejoli, dll).
                </p>
              </button>
            </div>

            {/* Input khusus bila memilih Link Eksternal */}
            {productForm.checkout_type === 'external' && (
              <div className="space-y-3 pt-2.5 border-t border-slate-200/80">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    URL Tujuan Eksternal / Link Affiliate *
                  </label>
                  <input
                    type="url"
                    required={productForm.checkout_type === 'external'}
                    value={productForm.external_url || ''}
                    onChange={(e) => setProductForm((p) => ({ ...p, external_url: e.target.value }))}
                    placeholder="https://shope.ee/..., https://vt.tiktok.com/..., atau link Sejoli"
                    className="w-full px-3.5 py-2 bg-white border border-purple-300 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/30"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Produk Affiliate / Mitra Luar (Shopee, TikTok, Mayar, Sejoli, dll). Pembeli yang menekan tombol beli akan langsung dialihkan ke URL ini.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 3c. Teks Tombol Aksi / CTA Label (Universal untuk Semua Tipe Produk) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Teks Tombol Aksi / CTA Label</span>
              </label>
              <span className="text-[10px] text-slate-500 font-medium">
                Default: <strong className="text-blue-600 font-bold">"{smartDefaultCta}"</strong>
              </span>
            </div>
            <input
              type="text"
              value={ctaTextValue}
              onChange={(e) => handleCtaTextChange(e.target.value)}
              placeholder={`Contoh: ${smartDefaultCta} / Beli Sekarang / Daftar Kelas Sekarang / Pesan Sekarang`}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-600 shadow-xs"
            />
            <p className="text-[10px] text-slate-400">
              Label tombol aksi pembeli di etalase &amp; landing page. Jika dikosongkan, otomatis menggunakan default cerdas: "{smartDefaultCta}".
            </p>
          </div>

          {/* 4. Promo Label & SKU */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Label Promo Singkat</label>
              <input
                type="text"
                value={productForm.promo || ''}
                onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
                placeholder="Contoh: Diskon 50%"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">SKU / Kode Barang</label>
              <input
                type="text"
                value={productForm.sku || ''}
                onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))}
                placeholder="Contoh: OB-FSK-001"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* 5. Stok Barang (Hanya untuk Retail Fisik dan FnB) */}
          {isPhysicalStockVertical && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Jumlah Stok Tersedia *
                  </label>
                  <input
                    type="number"
                    disabled={productForm.is_unlimited}
                    value={productForm.is_unlimited ? 9999 : (productForm.stock ?? 100)}
                    onChange={(e) => setProductForm((p) => ({ ...p, stock: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <label className="inline-flex items-center gap-1.5 self-start sm:self-center pt-2 sm:pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.is_unlimited || false}
                    onChange={(e) =>
                      setProductForm((p) => ({
                        ...p,
                        is_unlimited: e.target.checked,
                        stock: e.target.checked ? 9999 : p.stock,
                      }))
                    }
                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="text-xs text-slate-700 font-semibold">Stok Tak Terbatas (Unlimited)</span>
                </label>
              </div>
            </div>
          )}

          {/* FULFILLMENT & DOMAIN SPECIFIC PRODUCT FORM */}
          <ModularProductFormDispatcher
            verticalKey={resolveDomainVertical(storeCategory || currentType)}
            productForm={productForm}
            setProductForm={setProductForm}
            tenantSlug={tenantSlug}
            onMetadataChange={handleMetadataChange}
          />

          {/* METODE PEMBAYARAN & VOUCHER PROMO (DECOUPLED & MANDIRI) */}
          {productForm.checkout_type !== 'external' && (
            <div className="space-y-3.5">
              {/* A. Metode Pembayaran Checkout (Selalu Mandiri & Aktif) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      <span>Metode Pembayaran Checkout</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Fee Rp0
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Metode bayar aktif mandiri tanpa bergantung pada status voucher promo.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400 transition">
                    <input
                      type="checkbox"
                      checked={paymentMethods.enable_qris}
                      onChange={(e) => {
                        const updated = { ...paymentMethods, enable_qris: e.target.checked };
                        setPaymentMethods(updated);
                        syncPaymentMethodsToProductForm(updated);
                      }}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">QRIS Instan Otomatis</span>
                      <span className="text-[10px] text-slate-500">Bebas biaya admin (Fee Rp0) &amp; verifikasi kilat.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-blue-400 transition">
                    <input
                      type="checkbox"
                      checked={paymentMethods.enable_manual_transfer}
                      onChange={(e) => {
                        const updated = { ...paymentMethods, enable_manual_transfer: e.target.checked };
                        setPaymentMethods(updated);
                        syncPaymentMethodsToProductForm(updated);
                      }}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">Transfer Bank Manual</span>
                      <span className="text-[10px] text-slate-500">BCA / Mandiri dengan kode unik verifikasi acak.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* B. Pengaturan Voucher Promo (Toggle Switch Mandiri) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      <Tag className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Pengaturan Voucher Promo</span>
                      {voucherEnabled && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full uppercase">
                          {voucherForm.code || 'AKTIF'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Aktifkan kupon diskon atau potongan harga khusus untuk pembeli produk ini.
                    </p>
                  </div>

                  {/* Master Toggle Voucher */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={voucherEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setVoucherEnabled(enabled);
                        const updatedVoucher = {
                          ...voucherForm,
                          code: voucherForm.code || 'DISKON20K',
                          is_enabled: enabled,
                        };
                        setVoucherForm(updatedVoucher);
                        syncVoucherToProductForm(enabled, updatedVoucher);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Form Voucher: HANYA MUNCUL JIKA TOGGLE VOUCHER AKTIF */}
                {voucherEnabled ? (
                  <div className="space-y-3 pt-2.5 border-t border-slate-200/80">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Kode Voucher Promo *
                        </label>
                        <input
                          type="text"
                          required={voucherEnabled}
                          value={voucherForm.code}
                          onChange={(e) => {
                            const code = e.target.value.toUpperCase().replace(/\s+/g, '');
                            const updated = { ...voucherForm, code };
                            setVoucherForm(updated);
                            syncVoucherToProductForm(true, updated);
                          }}
                          placeholder="Contoh: HEMAT50, PROMO2026"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold uppercase focus:outline-none focus:border-indigo-600"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Minimal Belanja (Opsional, Rp)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={voucherForm.min_spend || ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : 0;
                            const updated = { ...voucherForm, min_spend: val };
                            setVoucherForm(updated);
                            syncVoucherToProductForm(true, updated);
                          }}
                          placeholder="0 (Tanpa minimum)"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                        />
                      </div>
                    </div>

                    {/* Pilihan Tipe Diskon Produk */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Tipe Diskon Produk
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const updated: ProductVoucherConfig = {
                              ...voucherForm,
                              discount_type: 'nominal',
                              discount_value: voucherForm.discount_type === 'percentage' ? 20000 : voucherForm.discount_value,
                            };
                            setVoucherForm(updated);
                            syncVoucherToProductForm(true, updated);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                            voucherForm.discount_type === 'nominal'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Diskon Nominal (Rp)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const updated: ProductVoucherConfig = {
                              ...voucherForm,
                              discount_type: 'percentage',
                              discount_value: voucherForm.discount_type === 'nominal' ? 10 : voucherForm.discount_value,
                            };
                            setVoucherForm(updated);
                            syncVoucherToProductForm(true, updated);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                            voucherForm.discount_type === 'percentage'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Diskon Persentase (%)
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block mb-1">
                          {voucherForm.discount_type === 'percentage' ? 'Besaran Diskon Persen (%)' : 'Besaran Diskon Flat (Rp)'}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={voucherForm.discount_type === 'percentage' ? 100 : undefined}
                            value={voucherForm.discount_value || ''}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : 0;
                              const updated = { ...voucherForm, discount_value: val };
                              setVoucherForm(updated);
                              syncVoucherToProductForm(true, updated);
                            }}
                            placeholder={voucherForm.discount_type === 'percentage' ? '10' : '20000'}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 pr-10"
                          />
                          <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                            {voucherForm.discount_type === 'percentage' ? '%' : 'Rp'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Subsidi Ongkir jika produk fisik */}
                    {isPhysicalStockVertical && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                        <label className="text-[11px] font-bold text-slate-700 block">
                          Diskon Ongkir Ekspedisi (Produk Fisik)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 text-xs">
                          {[
                            { id: 'none', label: 'Tanpa Subsidi' },
                            { id: 'flat', label: 'Subsidi Flat (Rp)' },
                            { id: 'free', label: 'Gratis Ongkir' },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                const updated: ProductVoucherConfig = {
                                  ...voucherForm,
                                  shipping_discount_type: item.id as any,
                                };
                                setVoucherForm(updated);
                                syncVoucherToProductForm(true, updated);
                              }}
                              className={`py-1.5 px-2 rounded-lg text-center font-bold text-[10px] transition cursor-pointer ${
                                (voucherForm.shipping_discount_type || 'none') === item.id
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        {voucherForm.shipping_discount_type === 'flat' && (
                          <div className="relative pt-1">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={voucherForm.shipping_discount_value || ''}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : 0;
                                const updated = { ...voucherForm, shipping_discount_value: val };
                                setVoucherForm(updated);
                                syncVoucherToProductForm(true, updated);
                              }}
                              placeholder="Nominal subsidi (mis: 10000)"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 pr-10"
                            />
                            <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">Rp</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic bg-white p-2.5 rounded-xl border border-dashed border-slate-200">
                    Voucher promo dinonaktifkan. Kotak input voucher tidak akan muncul di halaman checkout pembeli.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 8. Foto Produk */}
          <div>
            <ImageUpload
              label="Foto Produk"
              value={productForm.image}
              onChange={(url) => setProductForm((p) => ({ ...p, image: sanitizeImageUrl(url) }))}
              placeholder="Upload foto produk (Auto-convert WebP)"
              description="Auto-convert WebP & resize max width 1200px"
              tenantSlug={tenantSlug}
            />
          </div>

          {/* 9. Deskripsi Produk */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Deskripsi Produk</label>
            <textarea
              rows={3}
              value={productForm.description}
              onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Penjelasan ringkas materi, spesifikasi, atau layanan..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* 10. Materi & Fasilitas Utama (Khusus Digital/Course) */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Materi &amp; Fasilitas Utama (Khusus Digital/Course)</span>
              </label>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                1 Baris = 1 Poin
              </span>
            </div>
            <p className="text-[11px] text-emerald-800/80 leading-relaxed">
              Tuliskan daftar modul materi, fasilitas, bonus, atau benefit yang didapat pembeli (1 baris per poin). Poin-poin ini otomatis ter-render di landing page checkout produk.
            </p>
            <textarea
              rows={4}
              value={facilitiesString}
              onChange={(e) => handleFacilitiesChange(e.target.value)}
              placeholder="Contoh:&#10;Akses Selamanya Video Tutorial HD&#10;Template Notion &amp; Spreadsheet Siap Pakai&#10;Grup Diskusi &amp; Support Eksklusif&#10;Gratis Update Modul Materi Berikutnya"
              className="w-full px-3.5 py-2.5 bg-white border border-emerald-300/80 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 font-medium leading-relaxed"
            />
          </div>

          {/* 11. Penawaran Tambahan (Order Bump / Cross-Selling) - 100% Opsional */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Penawaran Tambahan (Order Bump / Cross-Selling)</span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                    Opsional
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Tawarkan produk pendukung / add-on di halaman checkout dengan 1x klik centang sebelum pembeli membayar.
                </p>
              </div>

              {/* Master Toggle */}
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={orderBumpsEnabled}
                  onChange={(e) => handleToggleMasterOrderBumps(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Form Penawaran - HANYA TAMPIL JIKA MASTER TOGGLE AKTIF */}
            {orderBumpsEnabled && (
              <div className="space-y-3 pt-2 border-t border-slate-200/80">
                {orderBumpItems.map((bump, index) => (
                  <div
                    key={bump.id || index}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span>Item Add-on #{index + 1}</span>
                      </span>

                      <div className="flex items-center gap-3">
                        {/* Toggle Aktif/Nonaktif per Item */}
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bump.is_active}
                            onChange={(e) => handleUpdateBumpItem(index, { is_active: e.target.checked })}
                            className="rounded text-amber-500 focus:ring-amber-400 h-3.5 w-3.5"
                          />
                          <span>{bump.is_active ? 'Aktif' : 'Nonaktif'}</span>
                        </label>

                        {/* Hapus Item */}
                        <button
                          type="button"
                          onClick={() => handleRemoveBumpItem(index)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition cursor-pointer"
                          title="Hapus penawaran add-on ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Select dari Produk Toko (Jika ada) */}
                    {availableStoreProducts.length > 0 && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">
                          Pilih Dari Produk Toko (Opsional untuk isi otomatis)
                        </label>
                        <select
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:border-amber-500"
                          onChange={(e) => {
                            const sel = availableStoreProducts.find((p) => String(p.id) === e.target.value);
                            if (sel) {
                              handleUpdateBumpItem(index, {
                                name: sel.name,
                                original_price: sel.price,
                                price: sel.promo_price && sel.promo_price < sel.price ? sel.promo_price : Math.round(sel.price * 0.7),
                                description: sel.description || `Dapatkan tambahan bundling ${sel.name} dengan harga hemat!`,
                                product_id: String(sel.id),
                              });
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>-- Pilih produk toko atau isi manual di bawah --</option>
                          {availableStoreProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Rp {p.price.toLocaleString('id-ID')})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 1. Nama Add-on */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Nama Produk / Layanan Add-on *
                      </label>
                      <input
                        type="text"
                        required={orderBumpsEnabled}
                        value={bump.name}
                        onChange={(e) => handleUpdateBumpItem(index, { name: e.target.value })}
                        placeholder="Contoh: Checklist & Template Copywriting Siap Pakai"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* 2. Harga Normal & Promo Bundling */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Harga Normal (Rp)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={bump.original_price ?? ''}
                          onChange={(e) => handleUpdateBumpItem(index, { original_price: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="Coret (mis: 150000)"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          Harga Promo Bundling (Rp) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          required={orderBumpsEnabled}
                          value={bump.price !== undefined && bump.price !== null ? bump.price : ''}
                          onChange={(e) => handleUpdateBumpItem(index, { price: Number(e.target.value) })}
                          placeholder="Bayar (mis: 49000)"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    {/* 3. Teks Badge / Callout Opsional */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Teks Badge / Callout (Opsional)
                      </label>
                      <input
                        type="text"
                        value={bump.badge_text || ''}
                        onChange={(e) => handleUpdateBumpItem(index, { badge_text: e.target.value })}
                        placeholder="Contoh: Penawaran Spesial 1x Klik / Hemat 70%"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* 4. Deskripsi Singkat Penawaran */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Deskripsi Singkat Penawaran
                      </label>
                      <textarea
                        rows={2}
                        value={bump.description || ''}
                        onChange={(e) => handleUpdateBumpItem(index, { description: e.target.value })}
                        placeholder="Penjelasan singkat benefit add-on ini..."
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddBumpItem}
                  className="w-full py-2 bg-amber-50 hover:bg-amber-100/80 border border-dashed border-amber-300 rounded-xl text-xs font-bold text-amber-900 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Penawaran Add-on Lainnya</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan ke Etalase</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* BoonPilot Product Pitch Architect Modal */}
    <BoonPilotPitchModal
      isOpen={isPitchModalOpen}
      onClose={() => setIsPitchModalOpen(false)}
      tenantSlug={tenantSlug || ''}
      defaultProductName={productForm.name || ''}
      defaultVertical={(() => {
        const vk = currentVerticalKey;
        if (vk === 'fnb') return 'FOOD';
        if (vk === 'digital_product') return 'DIGITAL';
        if (vk === 'field_service') return 'FIELD_SERVICE';
        if (vk === 'pro_service') return 'PROFESSIONAL_SERVICE';
        if (vk === 'creator_agency') return 'CREATOR_AGENCY';
        return 'PHYSICAL';
      })()}
      isCheckoutLite={isCheckoutLite}
      onApply={(patch) => {
        setProductForm((prev) => {
          const facilitiesArr = Array.isArray(patch.facilities) ? patch.facilities : [];
          const resolvedSlug = patch.slug || prev.slug;
          const currentConfig = prev.single_page_config || ({} as any);
          const currentMeta = prev.metadata || {};
          return {
            ...prev,
            ...(patch.name ? { name: patch.name } : {}),
            description: patch.description || prev.description,
            slug: resolvedSlug,
            single_page_config: {
              ...currentConfig,
              slug: resolvedSlug,
              ...(patch.single_page_config || {}),
            },
            promo: patch.promo || prev.promo,
            cta_label: patch.cta_label || prev.cta_label,
            facilities: facilitiesArr.length ? facilitiesArr : prev.facilities,
            features: facilitiesArr.length ? facilitiesArr : prev.features,
            metadata: {
              ...currentMeta,
              ...(patch.metadata || {}),
              facilities: facilitiesArr.length ? facilitiesArr : currentMeta.facilities,
              features: facilitiesArr.length ? facilitiesArr : currentMeta.features,
            },
          };
        });
      }}
    />
    </>
  );
}
