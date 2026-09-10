'use client';

import React, { useEffect } from 'react';
import { Package, X, Save } from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import { ProductItem } from '@/lib/product-catalog';

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  editingProductId: number | null;
  storeCategory?: string;
}

export default function ProductFormModal({
  isOpen,
  onClose,
  onSave,
  productForm,
  setProductForm,
  editingProductId,
  storeCategory,
}: ProductFormModalProps) {
  const isDigitalOnly = storeCategory === 'DIGITAL' || storeCategory === 'CREATOR_SERVICE';

  // Jadikan default kategorinya digital jika storeCategory DIGITAL atau CREATOR_SERVICE
  useEffect(() => {
    if (isOpen && isDigitalOnly) {
      if (productForm.category === 'fisik' || !productForm.category) {
        setProductForm(prev => ({
          ...prev,
          category: 'digital',
        }));
      }
    }
  }, [isOpen, isDigitalOnly, productForm.category, setProductForm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span>{editingProductId ? "Edit Produk" : "Tambah Produk Baru"}</span>
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
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Produk / Kelas *</label>
            <input
              type="text"
              required
              value={productForm.name}
              onChange={(e) => setProductForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Contoh: Ecourse Ads Masterclass 2026"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Kategori *</label>
              <select
                value={productForm.category}
                onChange={(e) => setProductForm(p => ({ ...p, category: e.target.value as any }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                <option value="terlaris">🔥 Produk Terlaris</option>
                <option value="digital">💻 Produk Digital / Course</option>
                {!isDigitalOnly && <option value="fisik">📦 Produk Fisik</option>}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Harga Normal (Rp) *</label>
              <input
                type="number"
                required
                value={productForm.price}
                onChange={(e) => setProductForm(p => ({ ...p, price: Number(e.target.value) }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Harga Promo (Rp)</label>
              <input
                type="number"
                value={productForm.promo_price || ""}
                onChange={(e) => setProductForm(p => ({ ...p, promo_price: Number(e.target.value) }))}
                placeholder="Opsional (harga coret)"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Label Promo Singkat</label>
              <input
                type="text"
                value={productForm.promo || ""}
                onChange={(e) => setProductForm(p => ({ ...p, promo: e.target.value }))}
                placeholder="Contoh: Diskon 50%"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Jumlah Stok Tersedia *</label>
              <input
                type="number"
                disabled={productForm.is_unlimited}
                value={productForm.is_unlimited ? 9999 : productForm.stock ?? 100}
                onChange={(e) => setProductForm(p => ({ ...p, stock: Number(e.target.value) }))}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
              />
              <label className="inline-flex items-center gap-1.5 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productForm.is_unlimited || false}
                  onChange={(e) => setProductForm(p => ({ ...p, is_unlimited: e.target.checked, stock: e.target.checked ? 9999 : p.stock }))}
                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span className="text-[11px] text-slate-600 font-medium">Stok Tak Terbatas (Digital)</span>
              </label>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">SKU / Kode Barang</label>
              <input
                type="text"
                value={productForm.sku || ""}
                onChange={(e) => setProductForm(p => ({ ...p, sku: e.target.value }))}
                placeholder="Contoh: OB-FSK-001"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <ImageUpload
              label="Foto Produk"
              value={productForm.image}
              onChange={(url) => setProductForm(p => ({ ...p, image: url }))}
              placeholder="Upload foto produk (Auto-convert WebP)"
              description="Auto-convert WebP & resize max width 1200px"
            />
          </div>

          {productForm.category === 'digital' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Link Akses Digital</label>
              <input
                type="url"
                value={productForm.download_url || ""}
                onChange={(e) => setProductForm((p: any) => ({ ...p, download_url: e.target.value }))}
                placeholder="https://drive.google.com/..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-blue-600 transition"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Deskripsi Produk</label>
            <textarea
              rows={3}
              value={productForm.description}
              onChange={(e) => setProductForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Penjelasan ringkas materi atau layanan..."
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
