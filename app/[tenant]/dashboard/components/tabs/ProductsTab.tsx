'use client';

import React, { useMemo, useState } from 'react';
import {
  Package,
  FileSpreadsheet,
  Plus,
  Sparkles,
  PackageOpen,
  ExternalLink,
  Edit,
  Trash2,
  Search,
  Filter,
  Copy,
  Check,
  Lock,
} from 'lucide-react';
import { ProductItem, slugify, resolveFulfillmentRequirements } from '@/lib/product-catalog';
import { sanitizeImageUrl } from '@/lib/image-utils';
import { getProductPageUrl } from '@/lib/utils/storefrontUrl';

type CanonicalCatalogType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'FNB';

interface CatalogTypeMeta {
  typeKey: CanonicalCatalogType;
  label: 'Fisik' | 'Digital' | 'Jasa' | 'F&B';
  badgeClass: string;
  isService: boolean;
  isDigital: boolean;
  isPhysical: boolean;
  subLabel?: string;
}

const CATALOG_TYPE_BADGE_MAP: Record<CanonicalCatalogType, { label: CatalogTypeMeta['label']; badgeClass: string }> = {
  PHYSICAL: {
    label: 'Fisik',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60',
  },
  DIGITAL: {
    label: 'Digital',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/60',
  },
  SERVICE: {
    label: 'Jasa',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60',
  },
  FNB: {
    label: 'F&B',
    badgeClass:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/60',
  },
};

const FILTER_TYPE_PILLS: Array<{ id: 'ALL' | CanonicalCatalogType; label: string }> = [
  { id: 'ALL', label: 'Semua' },
  { id: 'PHYSICAL', label: 'Fisik' },
  { id: 'DIGITAL', label: 'Digital' },
  { id: 'SERVICE', label: 'Jasa' },
  { id: 'FNB', label: 'F&B' },
];

function resolveCatalogTypeMeta(
  product: ProductItem,
  storeDefaults: {
    isServiceCategory: boolean;
    isDigitalCategory: boolean;
    isFoodCategory: boolean;
    isProfessional: boolean;
    isFieldService: boolean;
  }
): CatalogTypeMeta {
  const rawType = String(product.product_type || product.type || '').toUpperCase().trim();
  const rawCat = String(product.category || '').toLowerCase().trim();

  const isFood =
    rawType === 'FOOD' ||
    rawType === 'FNB' ||
    rawCat === 'fnb' ||
    rawCat === 'food' ||
    rawCat === 'kuliner' ||
    (!rawType && storeDefaults.isFoodCategory);

  const fulfillment = resolveFulfillmentRequirements(
    product.product_type ||
      product.type ||
      (storeDefaults.isServiceCategory
        ? 'SERVICE'
        : storeDefaults.isDigitalCategory
        ? 'DIGITAL'
        : 'PHYSICAL')
  );

  const isService =
    fulfillment.strategy === 'SERVICE' ||
    rawCat === 'jasa' ||
    rawCat === 'service' ||
    (!rawType && !isFood && storeDefaults.isServiceCategory);

  const isDigital =
    !isService &&
    !isFood &&
    (fulfillment.strategy === 'DIGITAL' ||
      rawCat === 'digital' ||
      Boolean(product.is_digital) ||
      Boolean(product.is_unlimited) ||
      (!rawType && storeDefaults.isDigitalCategory));

  const typeKey: CanonicalCatalogType = isFood
    ? 'FNB'
    : isService
    ? 'SERVICE'
    : isDigital
    ? 'DIGITAL'
    : 'PHYSICAL';

  const meta = CATALOG_TYPE_BADGE_MAP[typeKey];
  const candidateSub = (product.custom_badge || product.category || '').trim();
  const subLabel =
    candidateSub && candidateSub.toLowerCase() !== meta.label.toLowerCase()
      ? candidateSub
      : isService
      ? storeDefaults.isProfessional || product.product_type === 'PROFESSIONAL_SERVICE'
        ? 'Konsultasi'
        : storeDefaults.isFieldService || product.product_type === 'FIELD_SERVICE'
        ? 'Lapangan'
        : 'Booking'
      : undefined;

  return {
    typeKey,
    label: meta.label,
    badgeClass: meta.badgeClass,
    isService,
    isDigital,
    isPhysical: !isService && !isDigital,
    subLabel,
  };
}

function ProductTableThumbnail({ src, alt }: { src?: string; alt: string }) {
  const [error, setError] = useState(false);
  const safeSrc = sanitizeImageUrl(src);

  return (
    <img
      src={!safeSrc || error ? '/placeholder-product.png' : safeSrc}
      alt={alt || 'Produk'}
      onError={() => {
        if (!error) setError(true);
      }}
      className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-50 dark:bg-slate-800"
    />
  );
}

export interface ProductsTabProps {
  products: ProductItem[];
  tenantSlug: string;
  customDomain?: string | null;
  openNewProductModal: () => void;
  openEditProductModal: (p: ProductItem) => void;
  handleDeleteProduct: (id: number | string) => void;
  handleQuickStockChange: (id: number | string, delta: number) => void;
  handleToggleProductActive?: (id: number | string, newStatus?: boolean) => void;
  openSinglePageBuilder: (p: ProductItem) => void;
  onOpenBulkImport: () => void;
  storeCategory?: string;
  isCheckoutLite?: boolean;
  activeProductsCount?: number;
  isSubscriptionExpired?: boolean;
  onUpgrade?: () => void;
}

export default function ProductsTab({
  products,
  tenantSlug,
  customDomain,
  openNewProductModal,
  openEditProductModal,
  handleDeleteProduct,
  handleQuickStockChange,
  handleToggleProductActive,
  openSinglePageBuilder,
  onOpenBulkImport,
  storeCategory,
  isCheckoutLite = false,
  activeProductsCount,
  isSubscriptionExpired = false,
  onUpgrade,
}: ProductsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | CanonicalCatalogType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [copiedSlugId, setCopiedSlugId] = useState<number | string | null>(null);

  const safeProducts = useMemo(
    () => (Array.isArray(products) ? products.filter((p): p is ProductItem => Boolean(p)) : []),
    [products]
  );

  const currentActiveCount =
    activeProductsCount !== undefined
      ? activeProductsCount
      : safeProducts.filter((p) => p.is_active !== false).length;

  const showReadOnlyUpgradeAlert = () => {
    alert(
      'Masa aktif paket/trial telah berakhir. Dashboard dalam mode baca-saja. Silakan lakukan upgrade paket untuk memperbarui toko.'
    );
    if (onUpgrade) onUpgrade();
  };

  const handleAddProductClick = () => {
    if (isSubscriptionExpired) {
      showReadOnlyUpgradeAlert();
      return;
    }
    if (isCheckoutLite && currentActiveCount >= 3) {
      alert(
        'Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.'
      );
      return;
    }
    openNewProductModal();
  };

  const handleBulkImportClick = () => {
    if (isSubscriptionExpired) {
      showReadOnlyUpgradeAlert();
      return;
    }
    if (isCheckoutLite && currentActiveCount >= 3) {
      alert(
        'Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.'
      );
      return;
    }
    onOpenBulkImport();
  };

  const resolveStorefrontProductUrl = (product: ProductItem): string => {
    const productSlug =
      (typeof product.slug === 'string' && product.slug.trim()) ||
      (typeof product.single_page_config?.slug === 'string' && product.single_page_config.slug.trim()) ||
      slugify(product.name || 'produk');
    return getProductPageUrl(tenantSlug, productSlug, customDomain);
  };

  const handleEditProductClick = (product: ProductItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isSubscriptionExpired) {
      showReadOnlyUpgradeAlert();
      return;
    }
    openEditProductModal(product);
  };

  const handleCopyProductUrl = (product: ProductItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const url = resolveStorefrontProductUrl(product);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
    } catch {
      // Clipboard API unavailable in non-secure context
    }
    setCopiedSlugId(product.id);
    setTimeout(() => setCopiedSlugId(null), 2500);
  };

  const rawCat = (storeCategory || '').toUpperCase();
  const isProfessional =
    rawCat.includes('PROFESSIONAL') ||
    rawCat.includes('CONSULT') ||
    rawCat.includes('LEGAL') ||
    rawCat.includes('TRAVEL');
  const isFieldService = rawCat.includes('FIELD') || (rawCat.includes('SERVICE') && !isProfessional);
  const isServiceCategory = isProfessional || isFieldService;
  const isDigitalCategory = rawCat.includes('DIGITAL');
  const isCreatorAgency = rawCat.includes('CREATOR') || rawCat.includes('AGENCY');
  const isFoodCategory = rawCat.includes('FOOD') || rawCat.includes('KULINER') || rawCat.includes('F&B');
  const isPhysicalCategory = !isServiceCategory && !isDigitalCategory && !isCreatorAgency;

  const storeDefaults = useMemo(
    () => ({
      isServiceCategory,
      isDigitalCategory,
      isFoodCategory,
      isProfessional,
      isFieldService,
    }),
    [isServiceCategory, isDigitalCategory, isFoodCategory, isProfessional, isFieldService]
  );

  let headerTitle = 'Katalog Produk & Layanan';
  let headerDesc = 'Kelola daftar produk, harga, stok, status aktif, dan link etalase toko.';
  let addBtnText = 'Tambah Produk';

  if (isProfessional) {
    headerTitle = 'Katalog Jasa & Sesi Konsultasi';
    headerDesc = 'Kelola paket sesi konsultasi, durasi layanan, dan tarif honorarium.';
    addBtnText = 'Tambah Jasa';
  } else if (isFieldService) {
    headerTitle = 'Katalog Layanan & Servis';
    headerDesc = 'Kelola daftar layanan teknisi, tarif kunjungan, dan paket pengerjaan.';
    addBtnText = 'Tambah Layanan';
  } else if (isDigitalCategory) {
    headerTitle = 'Aset & Produk Digital';
    headerDesc = 'Kelola produk digital, modul e-course, lisensi, dan halaman penawaran.';
    addBtnText = 'Tambah Aset Digital';
  } else if (isCreatorAgency) {
    headerTitle = 'Paket Jasa & Kampanye Kreator';
    headerDesc = 'Kelola paket endorsement, live shopping, dan produksi konten UGC.';
    addBtnText = 'Tambah Paket';
  } else if (isFoodCategory) {
    headerTitle = 'Daftar Menu & Kuliner';
    headerDesc = 'Kelola menu hidangan, variasi porsi, harga, dan stok harian.';
    addBtnText = 'Tambah Menu';
  } else if (isPhysicalCategory) {
    headerTitle = 'Katalog Produk';
    headerDesc = 'Kelola daftar produk, SKU, harga, status aktif, dan halaman penjualan.';
    addBtnText = 'Tambah Produk';
  }

  const categories = useMemo(
    () => Array.from(new Set(safeProducts.map((p) => p.category).filter(Boolean))),
    [safeProducts]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<CanonicalCatalogType, number> = {
      PHYSICAL: 0,
      DIGITAL: 0,
      SERVICE: 0,
      FNB: 0,
    };
    for (const item of safeProducts) {
      const meta = resolveCatalogTypeMeta(item, storeDefaults);
      counts[meta.typeKey] += 1;
    }
    return counts;
  }, [safeProducts, storeDefaults]);

  const availableTypePills = useMemo(
    () =>
      FILTER_TYPE_PILLS.filter(
        (pill) => pill.id === 'ALL' || typeCounts[pill.id] > 0
      ),
    [typeCounts]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return safeProducts.filter((p) => {
      const meta = resolveCatalogTypeMeta(p, storeDefaults);
      const matchSearch =
        !q ||
        Boolean(p.name && p.name.toLowerCase().includes(q)) ||
        Boolean(p.sku && p.sku.toLowerCase().includes(q)) ||
        Boolean(p.description && p.description.toLowerCase().includes(q)) ||
        Boolean(p.slug && p.slug.toLowerCase().includes(q));
      const matchType = typeFilter === 'ALL' || meta.typeKey === typeFilter;
      const matchCat =
        categoryFilter === 'ALL' ||
        Boolean(p.category && p.category.toLowerCase() === categoryFilter.toLowerCase());
      return matchSearch && matchType && matchCat;
    });
  }, [safeProducts, searchQuery, typeFilter, categoryFilter, storeDefaults]);

  const renderStockControl = (product: ProductItem, meta: CatalogTypeMeta) => {
    if (meta.isService) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
          {meta.subLabel || 'Booking'}
        </span>
      );
    }
    if (meta.isDigital) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60">
          Unlimited
        </span>
      );
    }

    const stockValue = Number(product.stock ?? 0);
    return (
      <div className="inline-flex items-center gap-1">
        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-0.5">
          <button
            type="button"
            disabled={isSubscriptionExpired}
            onClick={(e) => {
              e.stopPropagation();
              if (isSubscriptionExpired) {
                showReadOnlyUpgradeAlert();
                return;
              }
              handleQuickStockChange(product.id, -1);
            }}
            className={`w-5 h-5 rounded-md text-xs font-bold flex items-center justify-center transition-colors ${
              isSubscriptionExpired
                ? 'text-slate-400 cursor-not-allowed opacity-50'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer'
            }`}
            aria-label={`Kurangi stok ${product.name}`}
            title={isSubscriptionExpired ? 'Masa trial telah habis' : 'Kurangi Stok'}
          >
            -
          </button>
          <span
            className={`px-1.5 min-w-[26px] text-center font-mono text-xs font-semibold tabular-nums ${
              stockValue === 0
                ? 'text-rose-600 dark:text-rose-400'
                : stockValue <= 10
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {stockValue}
          </span>
          <button
            type="button"
            disabled={isSubscriptionExpired}
            onClick={(e) => {
              e.stopPropagation();
              if (isSubscriptionExpired) {
                showReadOnlyUpgradeAlert();
                return;
              }
              handleQuickStockChange(product.id, 1);
            }}
            className={`w-5 h-5 rounded-md text-xs font-bold flex items-center justify-center transition-colors ${
              isSubscriptionExpired
                ? 'text-slate-400 cursor-not-allowed opacity-50'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer'
            }`}
            aria-label={`Tambah stok ${product.name}`}
            title={isSubscriptionExpired ? 'Masa trial telah habis' : 'Tambah Stok'}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  const renderStatusButton = (product: ProductItem) => {
    const isActive = product.is_active !== false;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isActive}
        disabled={isSubscriptionExpired}
        onClick={(e) => {
          e.stopPropagation();
          if (isSubscriptionExpired) {
            showReadOnlyUpgradeAlert();
            return;
          }
          if (handleToggleProductActive) {
            handleToggleProductActive(product.id, !isActive);
          }
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
          isSubscriptionExpired
            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
            : isActive
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 cursor-pointer'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'
        }`}
        title={
          isSubscriptionExpired
            ? 'Masa trial telah habis (Read-only)'
            : isActive
            ? 'Aktif (Klik untuk nonaktifkan dari etalase)'
            : 'Nonaktif (Klik untuk aktifkan di etalase)'
        }
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isActive ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
          }`}
        />
        <span>{isActive ? 'Aktif' : 'Nonaktif'}</span>
      </button>
    );
  };

  const renderQuickActions = (product: ProductItem) => {
    const productUrl = resolveStorefrontProductUrl(product);
    const isCopied = copiedSlugId === product.id;

    return (
      <div className="inline-flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={(e) => handleCopyProductUrl(product, e)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
          title="Salin URL Etalase Produk"
          aria-label={`Salin URL ${product.name}`}
        >
          {isCopied ? (
            <>
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Salin URL</span>
            </>
          )}
        </button>

        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          title="Buka Halaman Etalase"
          aria-label={`Buka etalase ${product.name}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openSinglePageBuilder(product);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold transition-colors cursor-pointer"
          title="Desain Halaman Produk (Landing Page)"
        >
          <Sparkles className="w-3 h-3 shrink-0" />
          <span>Desain Halaman Produk</span>
        </button>

        <button
          type="button"
          disabled={isSubscriptionExpired}
          onClick={(e) => handleEditProductClick(product, e)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
            isSubscriptionExpired
              ? 'border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed opacity-50'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer'
          }`}
          title={isSubscriptionExpired ? 'Masa trial telah habis (Read-only)' : 'Edit Info Produk'}
        >
          <Edit className="w-3 h-3 shrink-0" />
          <span>Edit Info</span>
        </button>

        <button
          type="button"
          disabled={isSubscriptionExpired}
          onClick={(e) => {
            e.stopPropagation();
            if (isSubscriptionExpired) {
              showReadOnlyUpgradeAlert();
              return;
            }
            handleDeleteProduct(product.id);
          }}
          className={`p-1.5 rounded-lg transition-colors ${
            isSubscriptionExpired
              ? 'text-slate-400 cursor-not-allowed opacity-50'
              : 'text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer'
          }`}
          title={isSubscriptionExpired ? 'Masa trial telah habis (Read-only)' : 'Hapus Produk'}
          aria-label={`Hapus ${product.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-4">
      {isSubscriptionExpired && (
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl flex items-center justify-between gap-4 text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Masa trial telah habis. Dashboard dalam mode baca-saja. Penambahan dan pengeditan produk dinonaktifkan.
            </span>
          </div>
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer"
            >
              Upgrade Paket
            </button>
          )}
        </div>
      )}

      {/* HEADER RINGKAS KATALOG */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id="catalog-table-heading"
              className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Package className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{headerTitle}</span>
            </h2>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 tabular-nums">
              {safeProducts.length}
            </span>
            {isCheckoutLite && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 tabular-nums">
                {currentActiveCount}/3 Aktif (Lite)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{headerDesc}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isPhysicalCategory && (
            <button
              type="button"
              onClick={handleBulkImportClick}
              disabled={isSubscriptionExpired}
              title={isSubscriptionExpired ? 'Masa aktif paket/trial telah berakhir (Read-only)' : undefined}
              className={`font-semibold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 border transition-colors ${
                isSubscriptionExpired
                  ? 'bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer'
              }`}
            >
              {isSubscriptionExpired ? (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>Import Massal</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleAddProductClick}
            disabled={isSubscriptionExpired}
            title={isSubscriptionExpired ? 'Masa aktif paket/trial telah berakhir (Read-only)' : undefined}
            className={`font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
              isSubscriptionExpired
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
            }`}
          >
            {isSubscriptionExpired ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>{addBtnText}</span>
          </button>
        </div>
      </div>

      {safeProducts.length === 0 ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1117] rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
            <PackageOpen className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Belum ada produk di etalase toko
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Tambahkan produk pertama atau impor file Excel/CSV agar langsung tampil di halaman penjualan Anda.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddProductClick}
              disabled={isSubscriptionExpired}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{addBtnText}</span>
            </button>
            {isPhysicalCategory && (
              <button
                type="button"
                onClick={handleBulkImportClick}
                disabled={isSubscriptionExpired}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Import Massal (.xlsx / .csv)</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* COMPACT SEARCH & CATEGORY FILTER TOOLBAR */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="relative flex-1 w-full lg:max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari produk berdasarkan nama atau SKU..."
                aria-label="Cari produk berdasarkan nama atau SKU"
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {availableTypePills.length > 1 && (
                <div
                  role="group"
                  aria-label="Filter tipe produk"
                  className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900 p-0.5"
                >
                  {availableTypePills.map((pill) => {
                    const isSelected = typeFilter === pill.id;
                    const count =
                      pill.id === 'ALL' ? safeProducts.length : typeCounts[pill.id];
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setTypeFilter(pill.id)}
                        aria-pressed={isSelected}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <span>{pill.label}</span>
                        <span className="text-[10px] opacity-70 tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {categories.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter kategori produk"
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  >
                    <option value="ALL">Semua Kategori</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tabular-nums ml-auto lg:ml-1">
                {filteredProducts.length} / {safeProducts.length} item
              </span>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1117] rounded-xl p-8 text-center space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Tidak ada produk yang cocok dengan filter atau kata kunci pencarian.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('ALL');
                  setCategoryFilter('ALL');
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Reset Pencarian & Filter
              </button>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1117] rounded-xl overflow-hidden">
              {/* DESKTOP DENSE TABLE */}
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="catalog-table-heading"
                className="hidden md:block overflow-x-auto focus:outline-none"
              >
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="py-2.5 px-3">
                        Produk
                      </th>
                      <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                        Tipe / Kategori
                      </th>
                      <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                        Stok
                      </th>
                      <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                        Harga
                      </th>
                      <th scope="col" className="py-2.5 px-3 text-center whitespace-nowrap">
                        Status
                      </th>
                      <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                        Aksi Cepat
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {filteredProducts.map((p) => {
                      const meta = resolveCatalogTypeMeta(p, storeDefaults);
                      const displayPrice = p.promo_price && p.promo_price > 0 ? p.promo_price : p.price;
                      const skuText = p.sku || 'SKU-AUTO';

                      return (
                        <tr
                          key={p.id}
                          className="border-b last:border-b-0 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* 1. Produk (Thumbnail 36x36 + Nama + SKU) */}
                          <td className="py-2.5 px-3 min-w-[230px]">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={(e) => handleEditProductClick(p, e)}
                                className="shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                                title={isSubscriptionExpired ? 'Masa trial telah habis (Read-only)' : `Edit ${p.name}`}
                                aria-label={`Edit foto ${p.name}`}
                              >
                                <ProductTableThumbnail
                                  src={(p as ProductItem & { image_url?: string }).image_url || p.image}
                                  alt={p.name}
                                />
                              </button>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={(e) => handleEditProductClick(p, e)}
                                    className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[240px] text-left cursor-pointer transition-colors"
                                    title={isSubscriptionExpired ? 'Masa trial telah habis (Read-only)' : `Edit ${p.name}`}
                                  >
                                    {p.name}
                                  </button>
                                  {p.checkout_type === 'external' && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                                      Affiliate
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                                  SKU: {skuText}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Tipe / Kategori */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.badgeClass}`}
                              >
                                {meta.label}
                              </span>
                              {meta.subLabel && (
                                <span
                                  className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[95px]"
                                  title={meta.subLabel}
                                >
                                  {meta.subLabel}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. Stok */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {renderStockControl(p, meta)}
                          </td>

                          {/* 4. Harga */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono tabular-nums">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {Number(displayPrice) === 0
                                ? 'Gratis'
                                : `Rp ${Number(displayPrice).toLocaleString('id-ID')}`}
                            </div>
                            {p.promo_price && p.promo_price > 0 && p.promo_price < p.price ? (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 line-through">
                                Rp {Number(p.price).toLocaleString('id-ID')}
                              </div>
                            ) : null}
                          </td>

                          {/* 5. Status */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {renderStatusButton(p)}
                          </td>

                          {/* 6. Aksi Cepat */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {renderQuickActions(p)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE COMPACT ROW LIST */}
              <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {filteredProducts.map((p) => {
                  const meta = resolveCatalogTypeMeta(p, storeDefaults);
                  const displayPrice = p.promo_price && p.promo_price > 0 ? p.promo_price : p.price;
                  const skuText = p.sku || 'SKU-AUTO';

                  return (
                    <div
                      key={p.id}
                      className="p-3 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => handleEditProductClick(p, e)}
                            className="shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                            title={isSubscriptionExpired ? 'Masa trial telah habis (Read-only)' : `Edit ${p.name}`}
                            aria-label={`Edit foto ${p.name}`}
                          >
                            <ProductTableThumbnail
                              src={(p as ProductItem & { image_url?: string }).image_url || p.image}
                              alt={p.name}
                            />
                          </button>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={(e) => handleEditProductClick(p, e)}
                              className="text-xs font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate text-left block max-w-full cursor-pointer transition-colors"
                              title={isSubscriptionExpired ? 'Masa trial telah habis (Read-only)' : `Edit ${p.name}`}
                            >
                              {p.name}
                            </button>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              SKU: {skuText}
                            </div>
                          </div>
                        </div>
                        {renderStatusButton(p)}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          {renderStockControl(p, meta)}
                        </div>
                        <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white text-right">
                          {Number(displayPrice) === 0
                            ? 'Gratis'
                            : `Rp ${Number(displayPrice).toLocaleString('id-ID')}`}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end flex-wrap gap-1">
                        {renderQuickActions(p)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
