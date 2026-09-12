'use client';

import React, { useEffect } from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

export interface ModularProductFormProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export default function FieldServiceProductForm({
  productForm,
  setProductForm,
  onMetadataChange,
}: ModularProductFormProps) {
  // Pastikan parameter background terkunci untuk jasa lapangan
  useEffect(() => {
    onMetadataChange('delivery_type', 'WHATSAPP_GROUP');
    setProductForm((prev) => ({
      ...prev,
      requires_shipping: false,
      weight: 0,
      weight_grams: 0,
      is_unlimited: true,
      stock: 999999,
      type: 'service',
      product_type: 'FIELD_SERVICE',
    }));
  }, [onMetadataChange, setProductForm]);

  return (
    <div className="space-y-4">
      {/* 1. Status Otomasi Koordinasi WhatsApp */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
            <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Koordinasi Layanan Jasa Lapangan</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
            Tanpa Kurir Fisik
          </span>
        </div>
        <p className="text-[11px] text-emerald-800/90 leading-relaxed">
          Pesanan yang masuk otomatis langsung diarahkan ke nomor WhatsApp toko untuk konfirmasi alamat dan waktu kunjungan teknisi.
        </p>
      </div>

      {/* 2. Estimasi Durasi & Catatan Garansi Layanan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Estimasi Durasi Pengerjaan (Opsional)
          </label>
          <input
            type="text"
            value={productForm.variants || ''}
            onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
            placeholder="Contoh: 1 - 2 Jam / Pengerjaan 45 Menit"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Garansi / Fasilitas Layanan (Opsional)
          </label>
          <input
            type="text"
            value={productForm.promo || ''}
            onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
            placeholder="Contoh: Garansi 30 Hari Bersih Tuntas"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
          />
        </div>
      </div>
    </div>
  );
}
