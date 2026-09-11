'use client';

import React, { useEffect } from 'react';
import { Package, X, Save, Truck, Link as LinkIcon, Key, FileText, Info, RefreshCw } from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import {
  ProductItem,
  ProductType,
  resolveFulfillmentRequirements,
  FulfillmentMetadata,
  slugify,
} from '@/lib/product-catalog';

export function mapBusinessCategoryToProductType(storeCategory?: string): ProductType {
  const cat = (storeCategory || '').toUpperCase();
  if (['FOOD', 'FNB', 'KULINER', 'RESTO', 'MAKANAN'].some((k) => cat.includes(k))) return 'FOOD';
  if (['DIGITAL', 'COURSE', 'SOFTWARE', 'CREATOR_SERVICE', 'KONTEN'].some((k) => cat.includes(k))) return 'DIGITAL';
  if (['FIELD_SERVICE', 'LOCAL_SERVICE', 'REPAIR', 'LAUNDRY', 'SALON', 'JASA_LAPANGAN'].some((k) => cat.includes(k))) return 'FIELD_SERVICE';
  if (['PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'ACCOUNTING'].some((k) => cat.includes(k))) return 'PROFESSIONAL_SERVICE';
  if (['AGENCY', 'MARKETING_AGENCY', 'DEV_AGENCY'].some((k) => cat.includes(k))) return 'AGENCY';
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
  const isDigitalOnly = storeCategory === 'DIGITAL' || storeCategory === 'CREATOR_SERVICE';

  // Set default product_type following tenant.business_category when modal opens for new product
  useEffect(() => {
    if (isOpen) {
      setProductForm((prev) => {
        let defaultType: ProductType = prev.product_type || 'PHYSICAL';
        if (!editingProductId && !prev.product_type) {
          defaultType = mapBusinessCategoryToProductType(storeCategory);
        } else if (!prev.product_type) {
          if (isDigitalOnly || prev.category === 'digital') {
            defaultType = 'DIGITAL';
          } else {
            defaultType = 'PHYSICAL';
          }
        }
        const reqs = resolveFulfillmentRequirements(defaultType);
        const currentSlug = prev.slug?.trim() || (prev.name ? slugify(prev.name) : '');
        return {
          ...prev,
          slug: currentSlug,
          product_type: defaultType,
          category: reqs.requiresShipping ? 'fisik' : 'digital',
          is_unlimited:
            prev.is_unlimited !== undefined
              ? prev.is_unlimited
              : !reqs.requiresShipping,
        };
      });
    }
  }, [isOpen, isDigitalOnly, storeCategory, editingProductId, setProductForm]);

  if (!isOpen) return null;

  const currentType: ProductType =
    productForm.product_type ||
    (!editingProductId
      ? mapBusinessCategoryToProductType(storeCategory)
      : isDigitalOnly || productForm.category === 'digital'
      ? 'DIGITAL'
      : 'PHYSICAL');

  const requirements = resolveFulfillmentRequirements(currentType);
  const metadata: FulfillmentMetadata = productForm.fulfillment_metadata || {
    delivery_type: 'DOWNLOAD_LINK',
    access_url: productForm.download_url || '',
    instructions: '',
  };

  const handleTypeChange = (newType: ProductType) => {
    const reqs = resolveFulfillmentRequirements(newType);
    setProductForm((prev) => ({
      ...prev,
      product_type: newType,
      category: reqs.requiresShipping ? 'fisik' : 'digital',
      is_unlimited: reqs.requiresShipping ? false : (prev.is_unlimited ?? true),
      weight_grams: reqs.requiresWeight ? (prev.weight_grams || 1000) : undefined,
    }));
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

          {/* 2. Product Type & Fulfillment Boundary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl">
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Tipe Produk (Fulfillment Boundary) *
              </label>
              <select
                value={currentType}
                onChange={(e) => handleTypeChange(e.target.value as ProductType)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="PHYSICAL">📦 Produk Fisik (Ekspedisi & Kurir)</option>
                <option value="DIGITAL">💻 Produk Digital (File / Ecourse / Video)</option>
                <option value="FOOD">🍲 Makanan / F&B (Instant & Kargo)</option>
                <option value="FIELD_SERVICE">🛠️ Layanan Jasa Lapangan</option>
                <option value="PROFESSIONAL_SERVICE">💼 Jasa Profesional / Konsultasi</option>
                <option value="AGENCY">🏢 Layanan Agency & Klien</option>
              </select>
            </div>

            <div className="flex flex-col justify-center text-[11px] text-slate-600">
              <div className="font-bold flex items-center gap-1 text-slate-800">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Strategi Checkout:</span>
              </div>
              <p className="mt-0.5 leading-snug">
                {requirements.requiresShipping
                  ? 'Wajib alamat pengiriman, kalkulasi ongkir & berat paket.'
                  : 'Checkout kilat (Nama, WA, Email) tanpa form alamat fisik.'}
              </p>
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

          {/* 6. SYARAT FULFILLMENT: Berat & Kurir (Hanya jika requiresWeight === true) */}
          {requirements.requiresWeight && (
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <Truck className="w-4 h-4 text-amber-700" />
                <span>Pengaturan Logistik & Berat Fisik</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Berat Paket (Gram) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={productForm.weight_grams || 1000}
                    onChange={(e) =>
                      setProductForm((p) => ({ ...p, weight_grams: Number(e.target.value) }))
                    }
                    placeholder="1000 gram (1 kg)"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div className="flex items-center text-[11px] text-slate-500 leading-snug">
                  Tarif kurir (J&T, SiCepat, Kargo, Instant) otomatis dihitung berdasarkan berat gram ini saat pembeli checkout.
                </div>
              </div>
            </div>
          )}

          {/* 7. SYARAT FULFILLMENT: Payload Digital / Service (Hanya jika requiresDeliveryPayload === true) */}
          {requirements.requiresDeliveryPayload && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <Key className="w-4 h-4 text-indigo-700" />
                  <span>Fulfillment Payload (Akses Digital & Layanan)</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                  Auto-Deliver Saat Lunas
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Tipe Pengiriman Akses
                  </label>
                  <select
                    value={metadata.delivery_type || 'DOWNLOAD_LINK'}
                    onChange={(e) => handleMetadataChange('delivery_type', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600 cursor-pointer"
                  >
                    <option value="DOWNLOAD_LINK">🔗 Link Download / Course / Akses URL</option>
                    <option value="LICENSE_KEY">🔑 Lisensi / Serial Key / Kupon</option>
                    <option value="BRIEF_FORM">📝 Form Brief / Konsultasi Layanan</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Tautan / URL Akses Utama *
                  </label>
                  <div className="relative">
                    <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      value={metadata.access_url || productForm.download_url || ''}
                      onChange={(e) => handleMetadataChange('access_url', e.target.value)}
                      placeholder="https://drive.google.com/... atau https://app..."
                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Petunjuk Aktivasi / Catatan Pembeli
                </label>
                <textarea
                  rows={2}
                  value={metadata.instructions || ''}
                  onChange={(e) => handleMetadataChange('instructions', e.target.value)}
                  placeholder="Contoh: Silakan klik link di atas dan login menggunakan email Anda. Jika ada kendala, hubungi CS kami."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* 8. Foto Produk */}
          <div>
            <ImageUpload
              label="Foto Produk"
              value={productForm.image}
              onChange={(url) => setProductForm((p) => ({ ...p, image: url }))}
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
