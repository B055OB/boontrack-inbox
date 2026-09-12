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
  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <Truck className="w-4 h-4 text-amber-700" />
            <span>Pengaturan Logistik, Ekspedisi & Berat Paket</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
            Wajib Ongkir Kurir
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Berat Produk (Gram) *
            </label>
            <input
              type="number"
              required
              min={1}
              value={productForm.weight_grams || 1000}
              onChange={(e) => setProductForm((p) => ({ ...p, weight_grams: Number(e.target.value) }))}
              placeholder="Contoh: 1000 gram (1 kg)"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-amber-600"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Tarif kurir (J&T, SiCepat, JNE) dihitung otomatis berdasarkan berat ini.
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Varian Produk (Warna / Ukuran)
            </label>
            <input
              type="text"
              value={productForm.variants || 'Hitam, Putih, Navy / S, M, L, XL'}
              onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
              placeholder="Contoh: Merah, Biru, Hitam / S, M, L"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-600"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Pisahkan dengan koma untuk pilihan varian di etalase.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
