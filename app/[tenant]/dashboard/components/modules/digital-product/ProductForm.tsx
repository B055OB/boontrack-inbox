'use client';

import React from 'react';
import { Key, Link as LinkIcon, Download, ShieldCheck } from 'lucide-react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

export interface ModularProductFormProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export default function DigitalProductForm({
  productForm,
  setProductForm,
  onMetadataChange,
}: ModularProductFormProps) {
  const metadata: FulfillmentMetadata = productForm.fulfillment_metadata || {
    delivery_type: 'DOWNLOAD_LINK',
    access_url: productForm.download_url || '',
    instructions: '',
  };

  return (
    <div className="space-y-4">
      {/* Akses & Payload File Digital */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
            <Key className="w-4 h-4 text-indigo-700" />
            <span>Payload File / Link Unduhan (Akses Digital Instan)</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
            Auto-Deliver Lunas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Tipe Pengiriman Akses
            </label>
            <select
              value={metadata.delivery_type || 'DOWNLOAD_LINK'}
              onChange={(e) => onMetadataChange('delivery_type', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="DOWNLOAD_LINK">🔗 Link Download (Google Drive / Cloud Storage)</option>
              <option value="LICENSE_KEY">🔑 Lisensi / Serial Key / Kode Registrasi</option>
              <option value="BRIEF_FORM">📝 Akses Portal Member Area / LMS</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              URL Link Download / Payload Akses *
            </label>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                required
                value={metadata.access_url || productForm.download_url || ''}
                onChange={(e) => onMetadataChange('access_url', e.target.value)}
                placeholder="https://drive.google.com/... atau https://app..."
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Informasi Lisensi & Durasi Akses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Masa Berlaku Akses Materi
            </label>
            <input
              type="text"
              value={productForm.variants || 'Akses Selamanya (Lifetime)'}
              onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
              placeholder="Contoh: Lifetime Access / 1 Tahun Berlangganan"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Format / Ekstensi File
            </label>
            <input
              type="text"
              value={productForm.promo || 'Video HD + PDF Modul'}
              onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
              placeholder="Contoh: Video MP4, E-book PDF, Template Notion"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Petunjuk Aktivasi / Panduan Download untuk Pembeli
          </label>
          <textarea
            rows={2}
            value={metadata.instructions || ''}
            onChange={(e) => onMetadataChange('instructions', e.target.value)}
            placeholder="Contoh: Klik tautan di atas untuk mengakses Google Drive materi. Simpan file zip ke perangkat lokal Anda. Hubungi CS bila perlu bantuan akses."
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600 leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
