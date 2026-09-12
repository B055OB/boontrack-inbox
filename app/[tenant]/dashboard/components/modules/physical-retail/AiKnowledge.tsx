'use client';

import React, { useState } from 'react';
import { Truck, RotateCcw, Ruler, Save } from 'lucide-react';

export default function PhysicalRetailAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [sizeGuide, setSizeGuide] = useState<string>(
    'Panduan Ukuran (Standar Lokal):\n• S: Lebar Dada 48cm, Panjang 68cm (BB 45-55 kg)\n• M: Lebar Dada 50cm, Panjang 70cm (BB 55-65 kg)\n• L: Lebar Dada 52cm, Panjang 72cm (BB 65-75 kg)\n• XL: Lebar Dada 54cm, Panjang 74cm (BB 75-85 kg)'
  );
  const [returnPolicy, setReturnPolicy] = useState<string>(
    'Garansi tukar size / retur cacat produksi berlaku 7 hari kalender sejak paket diterima (berdasarkan resi kurir). Wajib menyertakan video unboxing utuh tanpa jeda.'
  );
  const [shippingFaq, setShippingFaq] = useState<string>(
    'Pesanan yang masuk sebelum pukul 15:00 WIB dikirim pada hari yang sama. Estimasi tiba: Reguler 2-3 hari kerja (Jawa) dan 3-5 hari kerja (Luar Jawa).'
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Knowledge Retail & Produk Fisik berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-amber-600" />
          <span>Knowledge Khusus: Retail & Produk Fisik</span>
        </h3>
        <p className="text-xs text-slate-500">
          Panduan size chart pakaian/sepatu, kebijakan penukaran ukuran, dan info estimasi ekspedisi yang otomatis dijawab oleh bot WhatsApp.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-blue-600" />
            <span>Panduan Ukuran (Size Guide) & Spesifikasi Fisik</span>
          </label>
          <textarea
            rows={4}
            value={sizeGuide}
            onChange={(e) => setSizeGuide(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600 leading-relaxed font-mono"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            <span>Syarat & Prosedur Retur / Tukar Barang</span>
          </label>
          <textarea
            rows={3}
            value={returnPolicy}
            onChange={(e) => setReturnPolicy(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-amber-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Jadwal Pengiriman & Kebijakan Kurir</span>
          </label>
          <textarea
            rows={3}
            value={shippingFaq}
            onChange={(e) => setShippingFaq(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600 leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {savedFeedback && (
          <span className="text-xs font-bold text-emerald-600">{savedFeedback}</span>
        )}
        <button
          type="submit"
          className="ml-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Konfigurasi Retail Fisik</span>
        </button>
      </div>
    </form>
  );
}
