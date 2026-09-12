'use client';

import React from 'react';
import { Calendar, Video, Link as LinkIcon, UserCheck, Shield } from 'lucide-react';
import { ProductItem, FulfillmentMetadata } from '@/lib/product-catalog';

export interface ModularProductFormProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  tenantSlug?: string;
  onMetadataChange: (key: keyof FulfillmentMetadata, value: string) => void;
}

export default function ProServiceProductForm({
  productForm,
  setProductForm,
  onMetadataChange,
}: ModularProductFormProps) {
  const metadata: FulfillmentMetadata = productForm.fulfillment_metadata || {
    delivery_type: 'CALENDAR_LINK',
    access_url: productForm.download_url || '',
    instructions: '',
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-900 font-bold text-xs">
            <Video className="w-4 h-4 text-sky-700" />
            <span>Sesi Konsultasi & Reservasi Jadwal Privat</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-100 text-sky-800">
            Jasa Profesional
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Platform Meeting / Konsultasi
            </label>
            <select
              value={metadata.delivery_type || 'CALENDAR_LINK'}
              onChange={(e) => onMetadataChange('delivery_type', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-sky-600 cursor-pointer"
            >
              <option value="CALENDAR_LINK">📅 Cal.com / Calendly (Sinkronisasi Otomatis)</option>
              <option value="DOWNLOAD_LINK">💻 Google Meet / Zoom Room Langsung</option>
              <option value="WHATSAPP_GROUP">💬 Sesi Konsultasi Eksklusif via WhatsApp</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Link Booking Kalender / Room Meet *
            </label>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={metadata.access_url || productForm.download_url || ''}
                onChange={(e) => onMetadataChange('access_url', e.target.value)}
                placeholder="https://cal.com/nama-anda/sesi-privat"
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-600 font-medium"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Durasi Sesi Konsultasi
            </label>
            <input
              type="text"
              value={productForm.variants || '60 Menit 1-on-1'}
              onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
              placeholder="Contoh: 60 Menit 1-on-1 / 90 Menit Audit"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Output Dokumen / Deliverable
            </label>
            <input
              type="text"
              value={productForm.promo || 'Termasuk Rekaman & Action Plan'}
              onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
              placeholder="Contoh: PDF Action Plan + Rekaman Sesi"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-600"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Instruksi Persiapan & Tata Tertib Sesi untuk Klien
          </label>
          <textarea
            rows={2}
            value={metadata.instructions || ''}
            onChange={(e) => onMetadataChange('instructions', e.target.value)}
            placeholder="Contoh: Setelah memilih jam di kalender, siapkan data bisnis atau pertanyaan kunci minimal 15 menit sebelum sesi Zoom dimulai."
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-600 leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
