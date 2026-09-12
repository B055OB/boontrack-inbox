'use client';

import React, { useEffect } from 'react';
import { Package, X, Save, Link as LinkIcon, RefreshCw } from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import {
  ProductItem,
  ProductType,
  resolveFulfillmentRequirements,
  FulfillmentMetadata,
  slugify,
} from '@/lib/product-catalog';
import { sanitizeImageUrl } from '@/lib/image-utils';
import { ModularProductFormDispatcher, resolveDomainVertical } from './modules';

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
  if (['FIELD_SERVICE', 'LOCAL_SERVICE', 'REPAIR', 'LAUNDRY', 'SALON', 'JASA_LAPANGAN', 'SERVICE'].some((k) => cat.includes(k))) return 'FIELD_SERVICE';
  if (['PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'ACCOUNTING'].some((k) => cat.includes(k))) return 'PROFESSIONAL_SERVICE';
  if (['AGENCY', 'MARKETING_AGENCY', 'DEV_AGENCY', 'CREATOR'].some((k) => cat.includes(k))) return 'AGENCY';
  return 'PHYSICAL';
}

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  editingProductId: number | null;
  storeCategory?: string;
  tenantSlug?: string;
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
}: ProductFormModalProps) {
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

        return {
          ...prev,
          image: sanitizeImageUrl(prev.image),
          slug: currentSlug,
          product_type: meta.productType,
          type: meta.backendType,
          category: resolvedBadge,
          custom_badge: customBadge || (resolvedBadge !== meta.defaultBadge ? resolvedBadge : undefined),
          is_unlimited:
            prev.is_unlimited !== undefined
              ? prev.is_unlimited
              : reqs.strategy === 'DIGITAL',
        };
      });
    }
  }, [isOpen, storeCategory, editingProductId, setProductForm]);

  if (!isOpen) return null;

  const currentVerticalKey = resolveBoonVertical(productForm, storeCategory);
  const activeVerticalMeta = BOON_VERTICAL_OPTIONS.find((o) => o.key === currentVerticalKey) || BOON_VERTICAL_OPTIONS[0];

  const currentType: ProductType = productForm.product_type || activeVerticalMeta.productType;
  const requirements = resolveFulfillmentRequirements(currentType);

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span>{editingProductId ? 'Edit Produk' : 'Tambah Produk Baru'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-6 overflow-y-auto space-y-4 flex-1">
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
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Harga Normal (Rp) *
              </label>
              <input
                type="number"
                required
                value={productForm.price || ''}
                onChange={(e) => setProductForm((p) => ({ ...p, price: Number(e.target.value) }))}
                placeholder="Contoh: 250000"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Harga Promo (Rp)
              </label>
              <input
                type="number"
                value={productForm.promo_price || ''}
                onChange={(e) =>
                  setProductForm((p) => ({ ...p, promo_price: Number(e.target.value) }))
                }
                placeholder="Opsional (harga coret)"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
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

          {/* 5. Stok Barang */}
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
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
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

          {/* FULFILLMENT & DOMAIN SPECIFIC PRODUCT FORM */}
          <ModularProductFormDispatcher
            verticalKey={resolveDomainVertical(storeCategory || currentType)}
            productForm={productForm}
            setProductForm={setProductForm}
            tenantSlug={tenantSlug}
            onMetadataChange={handleMetadataChange}
          />

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
  );
}
