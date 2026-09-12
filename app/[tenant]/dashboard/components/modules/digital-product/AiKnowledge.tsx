'use client';

import React, { useState } from 'react';
import { Download, Key, HelpCircle, Save, ShieldCheck } from 'lucide-react';

export default function DigitalProductAiKnowledge({ tenantSlug }: { tenantSlug: string }) {
  const [downloadTutorial, setDownloadTutorial] = useState<string>(
    '1. Setelah pembayaran diverifikasi sistem, link unduhan instan langsung dikirim ke chat WhatsApp & email Anda.\n2. Klik link Google Drive / Cloud Storage, pilih menu Download All / Unduh Zip.\n3. Ekstrak file zip di laptop/komputer atau aplikasi file manager HP.'
  );
  const [licensePolicy, setLicensePolicy] = useState<string>(
    'Lisensi berlaku untuk penggunaan personal (1 user). Dilarang keras menyebarluaskan, menjual kembali (re-sell), atau membagikan akses file kepada pihak ketiga tanpa izin resmi.'
  );
  const [troubleshootingFaq, setTroubleshootingFaq] = useState<string>(
    'Q: Link download error atau limit Google Drive penuh?\nA: Silakan tunggu 5-10 menit atau coba buka via browser mode incognito / akun Google lain. Bila masih terkendala, bot akan mengarahkan ke link mirror server sekunder.'
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Knowledge Produk Digital berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-600" />
          <span>Knowledge Khusus: Produk Digital & E-Course</span>
        </h3>
        <p className="text-xs text-slate-500">
          Aturan tutorial unduhan, FAQ kendala ekstrak file, dan kebijakan hak cipta/lisensi yang digunakan AI Bot untuk melayani pembeli otomatis.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Panduan & Tutorial Cara Mengakses / Mengunduh File</span>
          </label>
          <textarea
            rows={3}
            value={downloadTutorial}
            onChange={(e) => setDownloadTutorial(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-indigo-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-amber-600" />
            <span>Ketentuan Lisensi & Kebijakan Hak Cipta</span>
          </label>
          <textarea
            rows={3}
            value={licensePolicy}
            onChange={(e) => setLicensePolicy(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-amber-600 leading-relaxed"
          />
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Solusi Kendala Teknis (Troubleshooting FAQ)</span>
          </label>
          <textarea
            rows={3}
            value={troubleshootingFaq}
            onChange={(e) => setTroubleshootingFaq(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600 leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {savedFeedback && (
          <span className="text-xs font-bold text-emerald-600">{savedFeedback}</span>
        )}
        <button
          type="submit"
          className="ml-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>Simpan Konfigurasi Digital</span>
        </button>
      </div>
    </form>
  );
}
