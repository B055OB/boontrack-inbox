'use client';

import React from 'react';
import { Clock, Link as LinkIcon } from 'lucide-react';
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
  const metadata: FulfillmentMetadata = productForm.fulfillment_metadata || {
    delivery_type: 'WHATSAPP_GROUP',
    access_url: productForm.download_url || '',
    instructions: '',
  };

  return (
    <div className="space-y-4">
      {/* 1. Koordinasi Layanan Teknisi */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
            <Clock className="w-4 h-4 text-emerald-700" />
            <span>Koordinasi Kunjungan & Penugasan Teknisi</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
            Jasa Lapangan
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Metode Koordinasi Pelanggan
            </label>
            <select
              value={metadata.delivery_type || 'WHATSAPP_GROUP'}
              onChange={(e) => onMetadataChange('delivery_type', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              <option value="WHATSAPP_GROUP">💬 WhatsApp Admin / Dispatch Teknisi</option>
              <option value="CALENDAR_LINK">📅 Link Reservasi Jadwal (Cal.com / Google Calendar)</option>
              <option value="BRIEF_FORM">📝 Formulir Detail Alamat & Keluhan</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Link WhatsApp / Booking Form (Opsional)
            </label>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={metadata.access_url || productForm.download_url || ''}
                onChange={(e) => onMetadataChange('access_url', e.target.value)}
                placeholder="https://wa.me/... atau https://cal.com/..."
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Durasi & Kuota Slot Pengerjaan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Estimasi Durasi Pengerjaan
            </label>
            <input
              type="text"
              value={productForm.variants || '1 - 2 Jam'}
              onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
              placeholder="Contoh: 1 - 2 Jam / Pengerjaan 45 Menit"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Cakupan Layanan & Garansi Pengerjaan
            </label>
            <input
              type="text"
              value={productForm.promo || 'Garansi 30 Hari'}
              onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
              placeholder="Contoh: Garansi 30 Hari / Gratis Cek Kebocoran"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Petunjuk & Prosedur Kunjungan Teknisi ke Pelanggan
          </label>
          <textarea
            rows={2}
            value={metadata.instructions || ''}
            onChange={(e) => onMetadataChange('instructions', e.target.value)}
            placeholder="Contoh: Setelah pembayaran diverifikasi, tim teknisi akan menghubungi nomor WhatsApp Anda untuk konfirmasi jam kedatangan dan pengecekan akses toren/pipa."
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600 leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
