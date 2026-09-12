'use client';

import React, { useState } from 'react';
import { Sparkles, Video, ShieldAlert, Save } from 'lucide-react';

export default function CreatorAgencyAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [talentPortfolio, setTalentPortfolio] = useState<string>(
    'Agensi mengelola 12+ talent live streaming & video creator dengan total reach 2.5M+ followers di TikTok & Instagram dengan niche Beauty, Fashion, FnB, dan Gadget.'
  );
  const [revisionLimits, setRevisionLimits] = useState<string>(
    '1. Revisi minor (teks, musik latar, cut durasi) maksimal 2 kali sebelum video di-publish.\n2. Revisi mayor (take ulang video karena perubahan brief sepihak) dikenakan biaya 50% dari rate card awal.'
  );
  const [samplePolicy, setSamplePolicy] = useState<string>(
    'Sampel produk yang dikirimkan klien untuk keperluan video review atau live stream tidak dapat dikembalikan (non-returnable) untuk efisiensi operasional studio.'
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Knowledge Agensi & Kreator berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span>Knowledge Khusus: Agency & Kreator Live</span>
        </h3>
        <p className="text-xs text-slate-500">
          Parameter panduan rate card, ketersediaan jadwal live, dan batasan revisi script untuk AI Bot saat merespons brand / agensi partner.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Portofolio Talent & Spesialisasi Niche</span>
          </label>
          <textarea
            rows={3}
            value={talentPortfolio}
            onChange={(e) => setTalentPortfolio(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-purple-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-indigo-600" />
            <span>Ketentuan Revisi Video & Timeline Produksi</span>
          </label>
          <textarea
            rows={3}
            value={revisionLimits}
            onChange={(e) => setRevisionLimits(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-indigo-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>Kebijakan Sampel Fisik Brand (Sample Retention)</span>
          </label>
          <textarea
            rows={3}
            value={samplePolicy}
            onChange={(e) => setSamplePolicy(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-amber-600 leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {savedFeedback && (
          <span className="text-xs font-bold text-emerald-600">{savedFeedback}</span>
        )}
        <button
          type="submit"
          className="ml-auto px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Konfigurasi Agensi</span>
        </button>
      </div>
    </form>
  );
}
