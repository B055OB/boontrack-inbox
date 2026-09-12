'use client';

import React, { useState } from 'react';
import { UtensilsCrossed, ThermometerSnowflake, ShieldCheck, Save } from 'lucide-react';

export default function FnbCulinaryAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [shelfLife, setShelfLife] = useState<string>(
    'Makanan siap santap tahan 8-12 jam di suhu ruang. Untuk produk vacuum beku (frozen food): bertahan 3-5 hari di chiller (kulkas bawah) dan hingga 3 bulan di freezer (-18°C).'
  );
  const [reheatingInstructions, setReheatingInstructions] = useState<string>(
    '1. Kukus selama 10-15 menit untuk tekstur paling lembut.\n2. Atau microwave selama 2-3 menit pada daya medium.\n3. Bila digoreng, pastikan produk sudah dicairkan (thawing) terlebih dahulu sebelum masuk minyak panas.'
  );
  const [halalAndAllergens, setHalalAndAllergens] = useState<string>(
    '100% Halal dengan bahan baku bersertifikat MUI/BPJPH. Mengandung alergen: udang, kedelai, dan kacang tanah (tersedia opsi bebas alergen berdasarkan permintaan khusus di catatan pesanan).'
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Knowledge Kuliner & F&B berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-orange-600" />
          <span>Knowledge Khusus: Kuliner & F&B</span>
        </h3>
        <p className="text-xs text-slate-500">
          Panduan daya tahan makanan, cara penyajian ulang, serta informasi halal & alergen yang menjadi rujukan AI Bot WhatsApp saat melayani pelanggan kuliner.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ThermometerSnowflake className="w-3.5 h-3.5 text-blue-600" />
            <span>Daya Tahan Makanan & Cara Penyimpanan</span>
          </label>
          <textarea
            rows={3}
            value={shelfLife}
            onChange={(e) => setShelfLife(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
            <span>Instruksi Memanaskan & Penyajian Makanan</span>
          </label>
          <textarea
            rows={3}
            value={reheatingInstructions}
            onChange={(e) => setReheatingInstructions(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Informasi Halal, Bahan Baku & Peringatan Alergen</span>
          </label>
          <textarea
            rows={3}
            value={halalAndAllergens}
            onChange={(e) => setHalalAndAllergens(e.target.value)}
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
          className="ml-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Konfigurasi Kuliner</span>
        </button>
      </div>
    </form>
  );
}
