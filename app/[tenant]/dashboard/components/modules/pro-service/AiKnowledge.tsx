'use client';

import React, { useState } from 'react';
import { Briefcase, FileCheck, Shield, Save } from 'lucide-react';

export default function ProServiceAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [scopeOfWork, setScopeOfWork] = useState<string>(
    'Layanan meliputi: 1 sesi audit mendalam (60-90 menit), ringkasan PDF action plan, serta follow-up Q&A via WhatsApp selama 7 hari pasca-sesi.'
  );
  const [credentials, setCredentials] = useState<string>(
    'Konsultan bersertifikasi dengan pengalaman 8+ tahun menangani campaign brand nasional dan portfolio kelolaan budget iklan Rp 10M+.'
  );
  const [confidentialityTerms, setConfidentialityTerms] = useState<string>(
    'Seluruh data bisnis, laporan keuangan, dan materi strategi klien dilindungi dengan klausul kerahasiaan (NDA). Data tidak akan dibagikan ke pihak manapun.'
  );
  const [reschedulePolicy, setReschedulePolicy] = useState<string>(
    'Reschedule jadwal dapat dilakukan maksimal H-1 sebelum sesi tanpa biaya tambahan. Pembatalan sepihak hari H akan dikenakan pemotongan 50% kuota waktu.'
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Knowledge Jasa Profesional berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-sky-600" />
          <span>Knowledge Khusus: Jasa Profesional & Konsultasi</span>
        </h3>
        <p className="text-xs text-slate-500">
          Aturan batasan scope of work, kualifikasi keahlian, dan kebijakan kerahasiaan (NDA) yang dijadikan acuan AI saat berinteraksi dengan calon klien.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-sky-600" />
            <span>Scope of Work & Batasan Layanan</span>
          </label>
          <textarea
            rows={3}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-sky-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kualifikasi Profesional & Portofolio Konsultan</span>
          </label>
          <textarea
            rows={3}
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>Kebijakan Kerahasiaan (NDA) & Ketentuan Reschedule</span>
          </label>
          <textarea
            rows={3}
            value={confidentialityTerms}
            onChange={(e) => setConfidentialityTerms(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-indigo-600 leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {savedFeedback && (
          <span className="text-xs font-bold text-emerald-600">{savedFeedback}</span>
        )}
        <button
          type="submit"
          className="ml-auto px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Konfigurasi Konsultasi</span>
        </button>
      </div>
    </form>
  );
}
