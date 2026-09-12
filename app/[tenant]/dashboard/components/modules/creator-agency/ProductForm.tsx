'use client';

import React from 'react';
import { Sparkles, Video, FileText, Link as LinkIcon } from 'lucide-react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

export interface ModularProductFormProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export default function CreatorAgencyProductForm({
  productForm,
  setProductForm,
  onMetadataChange,
}: ModularProductFormProps) {
  const metadata: FulfillmentMetadata = productForm.fulfillment_metadata || {
    delivery_type: 'BRIEF_FORM',
    access_url: productForm.download_url || '',
    instructions: '',
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-purple-700" />
            <span>Paket Kreator, Live Streaming & Campaign Agency</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
            Agency & Kreator
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Alur Pengumpulan Brief Klien
            </label>
            <select
              value={metadata.delivery_type || 'BRIEF_FORM'}
              onChange={(e) => onMetadataChange('delivery_type', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-purple-600 cursor-pointer"
            >
              <option value="BRIEF_FORM">📝 Google Form / Airtable Briefing Konten</option>
              <option value="WHATSAPP_GROUP">💬 Diskusi Grup WhatsApp Project & Tim Talent</option>
              <option value="CALENDAR_LINK">📅 Booking Jadwal Live Streaming / Studio</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Link Form Briefing / Google Form *
            </label>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={metadata.access_url || productForm.download_url || ''}
                onChange={(e) => onMetadataChange('access_url', e.target.value)}
                placeholder="https://forms.gle/... atau https://airtable.com/..."
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-600 font-medium"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Format Konten / Durasi Live
            </label>
            <input
              type="text"
              value={productForm.variants || '1 Video Reels/TikTok (60 Detik)'}
              onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
              placeholder="Contoh: 1 Video TikTok + 3 IG Story / 2 Jam Sesi Live"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Batas Revisi & Waktu Pengerjaan
            </label>
            <input
              type="text"
              value={productForm.promo || 'Maks. 2x Revisi Minor • 5 Hari Kerja'}
              onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
              placeholder="Contoh: Maks. 2x Revisi Minor • 5 Hari Kerja"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-600"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Instruksi Pengiriman Sampel Produk Fisik Klien (Jika Ada)
          </label>
          <textarea
            rows={2}
            value={metadata.instructions || ''}
            onChange={(e) => onMetadataChange('instructions', e.target.value)}
            placeholder="Contoh: Kirimkan 2 pcs sampel produk ke alamat studio kami. Sertakan kartu panduan selling point produk dan cantumkan kode pesanan di label paket."
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-600 leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
