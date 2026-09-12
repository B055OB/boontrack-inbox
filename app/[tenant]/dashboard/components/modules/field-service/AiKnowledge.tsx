'use client';

import React, { useState } from 'react';
import { MapPin, Clock, AlertTriangle, ShieldCheck, Save } from 'lucide-react';

export default function FieldServiceAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [coverageRadius, setCoverageRadius] = useState<string>('25 km dari Karawang Barat (Telukjambe, Galuh Mas, KIIC, Klari)');
  const [workingHours, setWorkingHours] = useState<string>('Senin - Minggu, 08:00 - 17:00 WIB (Reservasi H-1 disarankan)');
  const [safetyProtocols, setSafetyProtocols] = useState<string>(
    '1. Teknisi wajib menggunakan helm kerja & sabuk pengaman bila toren berada di ketinggian >3 meter.\n2. Pemeriksaan kelistrikan pompa / radar sebelum pengurasan dimulai.\n3. Sanitasi tangki toren menggunakan cairan food-grade non-kimia keras.'
  );
  const [emergencyEscalation, setEmergencyEscalation] = useState<string>(
    'Jika terjadi kebocoran pipa utama atau pelampung otomatis jebol mendadak, prioritaskan penutupan stop kran pusat dan hubungi hotline emergency WhatsApp teknisi: 0812-xxxx-xxxx.'
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Parameter Knowledge Jasa Lapangan berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Knowledge Khusus: Jasa Lapangan & Teknisi</span>
        </h3>
        <p className="text-xs text-slate-500">
          Parameter operasional ini menjadi referensi langsung bagi asisten AI WhatsApp saat menjawab radius layanan, jam pengerjaan, dan eskalasi teknis darurat.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span>Radius & Jangkauan Area Servis</span>
          </label>
          <input
            type="text"
            value={coverageRadius}
            onChange={(e) => setCoverageRadius(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600"
            placeholder="Contoh: Seluruh area Karawang, Cikarang Timur, Purwakarta Barat"
          />
          <span className="text-[11px] text-slate-400">
            AI akan menolak secara sopan bila lokasi pelanggan di luar radius di atas.
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Jam Kerja & Estimasi Kunjungan</span>
          </label>
          <input
            type="text"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
            placeholder="Contoh: Setiap hari 08:00 - 17:00 WIB"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>SOP Keselamatan & Penanganan Alat Teknisi</span>
          </label>
          <textarea
            rows={3}
            value={safetyProtocols}
            onChange={(e) => setSafetyProtocols(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-indigo-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>Prosedur Eskalasi Darurat (Emergency)</span>
          </label>
          <textarea
            rows={3}
            value={emergencyEscalation}
            onChange={(e) => setEmergencyEscalation(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-amber-600 leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {savedFeedback && (
          <span className="text-xs font-bold text-emerald-600">{savedFeedback}</span>
        )}
        <button
          type="submit"
          className="ml-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Konfigurasi Jasa Lapangan</span>
        </button>
      </div>
    </form>
  );
}
