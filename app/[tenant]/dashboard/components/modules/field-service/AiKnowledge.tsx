'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Save,
  MessageSquare,
  Sparkles,
  RotateCcw,
  Tag,
} from 'lucide-react';
import {
  DEFAULT_BOOKING_SUMMARY_TEMPLATE,
  TEMPLATE_VARIABLES_HINTS,
  getStoredBookingTemplate,
  setStoredBookingTemplate,
  parseBookingSummaryTemplate,
} from './booking-template';

const SAMPLE_PREVIEW_DATA = {
  nama_client: 'Bapak Hendra',
  ukuran_toren: '1000 Liter',
  alamat: 'Perumahan Grand Taruma Blok B3 No. 12, Karawang Barat',
  tanggal: '15 Sep 2026',
  jam: '14:00 - 16:00 WIB',
  no_wa: '081298765432',
  link_maps: 'https://maps.app.goo.gl/sampleTaruma',
};

export default function FieldServiceAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [coverageRadius, setCoverageRadius] = useState<string>(
    '25 km dari Karawang Barat (Telukjambe, Galuh Mas, KIIC, Klari)'
  );
  const [workingHours, setWorkingHours] = useState<string>(
    'Senin - Minggu, 08:00 - 17:00 WIB (Reservasi H-1 disarankan)'
  );
  const [safetyProtocols, setSafetyProtocols] = useState<string>(
    '1. Teknisi wajib menggunakan helm kerja & sabuk pengaman bila toren berada di ketinggian >3 meter.\n2. Pemeriksaan kelistrikan pompa / radar sebelum pengurasan dimulai.\n3. Sanitasi tangki toren menggunakan cairan food-grade non-kimia keras.'
  );
  const [emergencyEscalation, setEmergencyEscalation] = useState<string>(
    'Jika terjadi kebocoran pipa utama atau pelampung otomatis jebol mendadak, prioritaskan penutupan stop kran pusat dan hubungi hotline emergency WhatsApp teknisi: 0812-xxxx-xxxx.'
  );

  // Dynamic Seller-Styled WhatsApp Template
  const [bookingSummaryTemplate, setBookingSummaryTemplate] = useState<string>(
    DEFAULT_BOOKING_SUMMARY_TEMPLATE
  );

  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredBookingTemplate(tenantSlug);
    if (stored) {
      setBookingSummaryTemplate(stored);
    }
  }, [tenantSlug]);

  const handleInsertTag = (tag: string) => {
    setBookingSummaryTemplate((prev) => `${prev} ${tag}`);
  };

  const handleResetTemplate = () => {
    setBookingSummaryTemplate(DEFAULT_BOOKING_SUMMARY_TEMPLATE);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredBookingTemplate(tenantSlug, bookingSummaryTemplate);
    setSavedFeedback('✅ Parameter Knowledge & Format Template WA berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  const livePreview = parseBookingSummaryTemplate(bookingSummaryTemplate, SAMPLE_PREVIEW_DATA);

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Knowledge & Format Operasional Jasa Lapangan</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Parameter operasional ini menjadi referensi langsung bagi asisten AI WhatsApp saat menjawab radius layanan, jam kerja, serta template pesan order yang dikirim ke teknisi lapangan.
        </p>
      </div>

      <div className="space-y-4">
        {/* 1. Dynamic Seller-Style Template Textarea */}
        <div className="p-5 bg-white border border-blue-200 rounded-3xl shadow-xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <label className="text-xs font-black text-slate-900 block">
                  Format Pesan Rangkuman Booking WhatsApp
                </label>
                <span className="text-[11px] text-slate-500">
                  Dapat diedit bebas sesuai SOP toko. Variabel otomatis diganti data asli pemesan.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetTemplate}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer self-start sm:self-auto border border-slate-200"
              title="Kembalikan ke template default format Sakti"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Default (Format Sakti)</span>
            </button>
          </div>

          {/* Tag Helper Pills */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
              <Tag className="w-3 h-3 text-blue-600" />
              <span>Variabel Tag Tersedia (Klik untuk menyisipkan):</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES_HINTS.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => handleInsertTag(item.tag)}
                  className="px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-mono font-bold border border-slate-200 hover:border-blue-300 transition cursor-pointer"
                  title={item.desc}
                >
                  {item.tag}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea Editor */}
          <div>
            <textarea
              rows={8}
              value={bookingSummaryTemplate}
              onChange={(e) => setBookingSummaryTemplate(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-600 leading-relaxed"
              placeholder="Tulis format pesan WhatsApp di sini..."
            />
          </div>

          {/* Live Preview WhatsApp Message */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pratinjau Tampilan Pesan WhatsApp (Live Preview):</span>
            </div>
            <pre className="text-[11px] font-sans text-slate-800 bg-white p-3.5 rounded-xl border border-emerald-100 whitespace-pre-wrap leading-relaxed shadow-2xs">
              {livePreview}
            </pre>
          </div>
        </div>

        {/* 2. Radius & Area Servis */}
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
            AI akan mengonfirmasi atau menolak secara sopan bila lokasi pelanggan di luar radius di atas.
          </span>
        </div>

        {/* 3. Jam Kerja */}
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

        {/* 4. SOP Keselamatan */}
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

        {/* 5. Eskalasi Darurat */}
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
          <span>Simpan Konfigurasi & Format WA</span>
        </button>
      </div>
    </form>
  );
}
