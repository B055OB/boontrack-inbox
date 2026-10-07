"use client";

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Scale,
  CheckCircle2,
  AlertTriangle,
  X,
  Lock,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';

interface ResellerComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  onSuccess?: (acceptedAt: string) => void;
}

export default function ResellerComplianceModal({
  isOpen,
  onClose,
  tenantSlug,
  onSuccess,
}: ResellerComplianceModalProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirmActivation = async () => {
    if (!isChecked || isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/compliance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (onSuccess) {
          onSuccess(data.accepted_at || new Date().toISOString());
        }
        onClose();
      } else {
        setErrorMessage(data.error || 'Gagal menyimpan persetujuan kepatuhan hukum. Silakan coba kembali.');
      }
    } catch (err: any) {
      console.error('[ResellerComplianceModal] Submit error:', err);
      setErrorMessage('Terjadi kendala jaringan saat menghubungi server. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reseller-compliance-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-slate-500/5 to-transparent">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  Kepatuhan Regulasi RI & ToS
                </span>
                <span className="text-[10px] font-medium text-slate-400">Versi 1.0.0</span>
              </div>
              <h2 id="reseller-compliance-title" className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                Persetujuan Hukum Program Reseller Toko
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {/* Alert Notice Banner */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-amber-800 dark:text-amber-300">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="text-xs">
              <strong>Pemberitahuan Wajib:</strong> Sebelum mengaktifkan modul kemitraan reseller di toko Anda, Anda diwajibkan memahami batasan hukum dan skema non-kustodial berikut demi mematuhi regulasi niaga elektronik Indonesia.
            </div>
          </div>

          {/* Section 1: Kepatuhan Regulasi Indonesia & Anti Skema Piramida */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 text-sm">
              <span className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-mono font-bold">1</span>
              <span>Kepatuhan Anti-Skema Piramida & Regulasi Perdagangan RI</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 pl-7">
              Berdasarkan <strong>Undang-Undang No. 7 Tahun 2014 tentang Perdagangan</strong> dan <strong>Permendag No. 70/2019</strong>:
            </p>
            <ul className="list-disc pl-11 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <li>Modul ini <strong>HANYA</strong> diperuntukkan bagi distribusi langsung barang/jasa riil (1-tingkat / <em>Single-Level Direct Sales</em>).</li>
              <li><strong>Dilarang Keras:</strong> Memungut biaya pendaftaran mitra berjenjang tanpa produk riil, skema piramida/ponzi, menjanjikan imbal hasil pasif (*get-rich-quick*), atau skema *Multi-Level Marketing* (MLM) tanpa izin resmi SIUPL.</li>
              <li>Produk yang dijual wajib memiliki izin edar sah (BPOM, PIRT, atau sertifikasi relevan untuk kategori makanan/kosmetik/obat).</li>
            </ul>
          </div>

          {/* Section 2: Penegasan Non-Custodial */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 text-sm">
              <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-mono font-bold">2</span>
              <span>Prinsip Non-Custodial & Kemandirian Finansial</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 pl-7">
              BoonTrack bertindak murni sebagai <strong>penyedia infrastruktur teknologi SaaS</strong> yang memfasilitasi pencatatan atribusi klik tautan dan kalkulator pembukuan komisi (*ledger*):
            </p>
            <ul className="list-disc pl-11 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <li>BoonTrack <strong>TIDAK</strong> menampung dana komisi (*zero escrow* / tanpa rekening penampung).</li>
              <li>BoonTrack <strong>TIDAK</strong> melakukan penarikan otomatis atau penyaluran (*payout transfer*) dana bagi hasil kepada reseller Anda.</li>
              <li>100% uang pembayaran pembeli masuk langsung ke rekening/QRIS Merchant. <strong>Kewajiban pelunasan hak komisi kepada reseller sepenuhnya berada di bawah tanggung jawab Merchant</strong>.</li>
            </ul>
          </div>

          {/* Section 3: Tanggung Jawab & Sanksi Hukum */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 text-sm">
              <span className="w-5 h-5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs font-mono font-bold">3</span>
              <span>Integritas Toko & Penonaktifan Layanan</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 pl-7">
              Merchant membebaskan BoonTrack dari segala tuntutan hukum, klaim penipuan konsumen, atau sengketa pembayaran komisi dengan reseller. Pelanggaran terhadap ketentuan ini berhak mengakibatkan penonaktifan instan akun toko tanpa kompensasi biaya langganan.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Checkbox Persetujuan */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-950 cursor-pointer transition select-none">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-normal">
                Saya telah membaca, memahami, dan menyetujui seluruh ketentuan kepatuhan hukum di atas. Saya menyatakan bahwa operasional toko saya tunduk pada hukum Republik Indonesia dan saya bertanggung jawab penuh atas segala pembayaran komisi reseller.
              </span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
          >
            Batal / Nanti Saja
          </button>
          <button
            type="button"
            onClick={handleConfirmActivation}
            disabled={!isChecked || isLoading}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition ${
              isChecked && !isLoading
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memproses Aktivasi...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Saya Setuju & Aktifkan Fitur Reseller</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
