'use client';

import React from 'react';
import { UtensilsCrossed, Clock, Flame, Truck } from 'lucide-react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

export interface ModularProductFormProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export default function FnbCulinaryProductForm({
  productForm,
  setProductForm,
}: ModularProductFormProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-orange-900 font-bold text-xs">
            <UtensilsCrossed className="w-4 h-4 text-orange-700" />
            <span>Spesifikasi Menu Kuliner, Ketahanan & Porsi</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-100 text-orange-800">
            Kuliner & F&B
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Berat Paket Makanan (Gram) *
            </label>
            <input
              type="number"
              required
              min={1}
              value={productForm.weight_grams || 500}
              onChange={(e) => setProductForm((p) => ({ ...p, weight_grams: Number(e.target.value) }))}
              placeholder="Contoh: 500 gram (Porsi Standar)"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-orange-600"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Dibutuhkan untuk penentuan kapasitas motor kurir instan (GoSend/Grab).
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Pilihan Varian / Level Pedas / Topping
            </label>
            <input
              type="text"
              value={productForm.variants || 'Level 1, Level 2, Level 3 / Extra Sambal'}
              onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
              placeholder="Contoh: Manis, Pedas Sedang, Super Pedas"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Daya Tahan & Suhu Penyimpanan
            </label>
            <input
              type="text"
              value={productForm.promo || '2 Hari Suhu Ruang • 1 Bulan Freezer'}
              onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
              placeholder="Contoh: 2 Hari Suhu Ruang • 1 Bulan Freezer"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Catatan Kemasan & Penyajian
            </label>
            <input
              type="text"
              value={productForm.description || 'Kemasan Vacum Food Grade'}
              onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Contoh: Kemasan Vacum Food Grade Kedap Udara"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
