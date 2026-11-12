'use client';

import React from 'react';
import { Truck, Package, Layers, Info } from 'lucide-react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

export interface ModularProductFormProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export default function PhysicalRetailProductForm({
  productForm,
  setProductForm,
}: ModularProductFormProps) {
  const safeForm = productForm || ({} as ProductItem);
  const productType = (safeForm?.product_type || '').toUpperCase().trim();
  const isPhysical = productType === 'PHYSICAL';

  // Section "Pengaturan Logistik, Ekspedisi & Berat Paket" HANYA boleh di-render jika productType === 'PHYSICAL'
  if (!isPhysical) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
            <Truck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>Pengaturan Logistik, Ekspedisi & Berat Paket</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
            Wajib Ongkir Kurir
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
              Berat Produk (Gram) *
            </label>
            <input
              type="number"
              required
              min={1}
              value={safeForm.weight_grams || 1000}
              onChange={(e) => setProductForm((p) => ({ ...(p || {}), weight_grams: Number(e.target.value) }))}
              placeholder="Contoh: 1000 gram (1 kg)"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold font-mono focus:outline-none focus:border-amber-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              Tarif kurir (J&T, SiCepat, JNE) dihitung otomatis berdasarkan berat ini.
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
              Varian Produk (Warna / Ukuran)
            </label>
            <input
              type="text"
              value={safeForm.variants || 'Hitam, Putih, Navy / S, M, L, XL'}
              onChange={(e) => setProductForm((p) => ({ ...(p || {}), variants: e.target.value }))}
              placeholder="Contoh: Merah, Biru, Hitam / S, M, L"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-600"
            />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              Pisahkan dengan koma untuk pilihan varian di etalase.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
