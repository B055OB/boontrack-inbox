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
  const safeForm = productForm || ({} as ProductItem);
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
              value={safeForm.weight_grams !== undefined && safeForm.weight_grams !== null ? safeForm.weight_grams : (safeForm.fulfillment_metadata?.weight_grams ?? '')}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Number(e.target.value);
                setProductForm((p) => ({
                  ...(p || {}),
                  weight_grams: typeof val === 'number' ? val : undefined,
                  fulfillment_metadata: {
                    ...(p?.fulfillment_metadata || {}),
                    weight_grams: typeof val === 'number' ? val : undefined,
                  },
                }));
              }}
              placeholder="Contoh: 250 gram"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:outline-none focus:border-orange-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
              value={safeForm.variants || ''}
              onChange={(e) => setProductForm((p) => ({ ...(p || {}), variants: e.target.value }))}
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
              value={safeForm.metadata?.shelf_life || safeForm.fulfillment_metadata?.shelf_life || ''}
              onChange={(e) => {
                const val = e.target.value;
                setProductForm((p) => ({
                  ...(p || {}),
                  metadata: {
                    ...(p?.metadata || {}),
                    shelf_life: val,
                  },
                  fulfillment_metadata: {
                    ...(p?.fulfillment_metadata || {}),
                    shelf_life: val,
                  },
                }));
              }}
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
              value={safeForm.metadata?.packaging_notes || safeForm.fulfillment_metadata?.packaging_notes || ''}
              onChange={(e) => {
                const val = e.target.value;
                setProductForm((p) => ({
                  ...(p || {}),
                  metadata: {
                    ...(p?.metadata || {}),
                    packaging_notes: val,
                  },
                  fulfillment_metadata: {
                    ...(p?.fulfillment_metadata || {}),
                    packaging_notes: val,
                  },
                }));
              }}
              placeholder="Contoh: Kemasan Vacum Food Grade Kedap Udara"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-orange-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
