'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Banknote,
  FileDown,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  RefreshCw,
  FileText,
  CreditCard,
  Building2,
} from 'lucide-react';
import {
  generateDefaultInvoiceNumber,
  downloadInvoicePdf,
  InvoicePdfData,
} from '@/lib/utils/invoicePdfGenerator';

interface OfflinePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tenants?: Array<{
    id: string;
    name: string;
    slug: string;
    tier?: string;
    category?: string;
  }>;
  initialTenant?: {
    id: string;
    name: string;
    slug: string;
    tier?: string;
    category?: string;
  } | null;
}

export default function OfflinePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  tenants = [],
  initialTenant = null,
}: OfflinePaymentModalProps) {
  const [selectedTenant, setSelectedTenant] = useState<any>(initialTenant);
  const [tenantSearch, setTenantSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState<'MANUAL_TRANSFER' | 'CASH'>('MANUAL_TRANSFER');
  const [category, setCategory] = useState<'B2B_CUSTOM_APP' | 'SAAS_SUBSCRIPTION' | 'SPECIAL_CASE'>('B2B_CUSTOM_APP');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [autoDownloadPdf, setAutoDownloadPdf] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTenant(initialTenant || null);
      setTenantSearch(initialTenant ? initialTenant.name : '');
      setAmount('');
      setChannel('MANUAL_TRANSFER');
      setCategory('B2B_CUSTOM_APP');
      setReferenceNo(generateDefaultInvoiceNumber());
      setNotes('');
      setFeedback(null);
    }
  }, [isOpen, initialTenant]);

  // Filter tenants by search query
  const searchedTenants = useMemo(() => {
    if (!tenantSearch.trim() || selectedTenant) return [];
    const q = tenantSearch.toLowerCase().trim();
    return (tenants || [])
      .filter((t) => t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tenantSearch, tenants, selectedTenant]);

  // Regenerate reference number
  const handleRegenerateRef = () => {
    setReferenceNo(generateDefaultInvoiceNumber());
  };

  const executePayment = async (forceDownloadPdf: boolean) => {
    if (!selectedTenant) {
      setFeedback({ type: 'error', message: 'Silakan pilih Tenant / Klien terlebih dahulu.' });
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setFeedback({ type: 'error', message: 'Nominal pembayaran harus berupa angka dan lebih besar dari 0.' });
      return;
    }

    const finalRefNo = referenceNo.trim() || generateDefaultInvoiceNumber();

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/transactions/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: selectedTenant.id,
          amount_idr: numericAmount,
          payment_channel: channel,
          category,
          reference_no: finalRefNo,
          notes: notes.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mencatat pembayaran');
      }

      // Check whether to download PDF
      const shouldDownload = forceDownloadPdf || autoDownloadPdf;
      if (shouldDownload) {
        const invoicePayload: InvoicePdfData = json.data?.invoice_payload || {
          client_name: selectedTenant.name,
          client_slug: selectedTenant.slug,
          amount: numericAmount,
          payment_method: channel,
          invoice_no: finalRefNo,
          notes: notes.trim(),
          category,
          status: 'PAID',
        };
        downloadInvoicePdf(invoicePayload);
      }

      setFeedback({
        type: 'success',
        message: `Settlement Rp ${numericAmount.toLocaleString('id-ID')} untuk "${selectedTenant.name}" berhasil dicatat (SETTLED) & diaudit ke ledger!${
          shouldDownload ? ' Invoice PDF otomatis diunduh.' : ''
        }`,
      });

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Terjadi kesalahan sistem saat mencatat transaksi.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-5">
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/10">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                Catat Pembayaran Masuk (Offline / Direct)
              </h3>
              <p className="text-xs text-slate-400">
                Settlement langsung kontrak B2B, transfer bank, atau tunai (dengan Auto-Generate Invoice PDF)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executePayment(false);
          }}
          className="space-y-4"
        >
          {/* 1. Pilih Tenant / Klien */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              1. Pilih Tenant / Klien <span className="text-rose-400">*</span>
            </label>
            {selectedTenant ? (
              <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-white flex items-center gap-2">
                    <span>{selectedTenant.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      /{selectedTenant.slug}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Tier: <span className="text-slate-300 font-semibold">{selectedTenant.tier || 'FREE'}</span> • Kategori: <span className="text-slate-300 font-semibold">{selectedTenant.category || 'Shop'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTenant(null);
                    setTenantSearch('');
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  Ganti
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ketik slug atau nama, misal: tumbuh-kembang-anak..."
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  required
                />

                {/* Autocomplete Dropdown */}
                {searchedTenants.length > 0 && (
                  <div className="mt-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-20 max-h-48 overflow-y-auto">
                    {searchedTenants.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTenant(t);
                          setTenantSearch(t.name);
                        }}
                        className="w-full p-2.5 text-left hover:bg-slate-800/80 transition flex items-center justify-between text-xs cursor-pointer border-b border-slate-900 last:border-b-0"
                      >
                        <div>
                          <span className="font-bold text-white block">{t.name}</span>
                          <span className="text-[10px] font-mono text-emerald-400">/{t.slug}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                            {t.tier || 'FREE'}
                          </span>
                          <span className="text-[9px] text-slate-500 block uppercase font-mono mt-0.5">
                            {t.category || 'Shop'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Nominal Settlement (Rp) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-300">
                2. Nominal Settlement (Rp) <span className="text-rose-400">*</span>
              </label>
              {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
                <span className="text-xs font-black font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  Rp {Number(amount).toLocaleString('id-ID')}
                </span>
              )}
            </div>
            <input
              type="number"
              min="1"
              placeholder="Contoh: 15000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
              required
            />

            {/* Preset chips */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {[
                { label: '149 Rb (Pro 1 Bln)', val: '149000' },
                { label: '1.49 Jt (Pro 1 Thn)', val: '1490000' },
                { label: '5 Jt (Pilot B2B)', val: '5000000' },
                { label: '15 Jt (Kontrak Custom)', val: '15000000' },
              ].map((chip) => (
                <button
                  key={chip.val}
                  type="button"
                  onClick={() => setAmount(chip.val)}
                  className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[10px] font-bold text-slate-300 hover:text-white transition cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Metode Pembayaran & Kategori Transaksi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Metode Pembayaran */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                3. Metode Pembayaran
              </label>
              <div className="space-y-1.5">
                <label
                  className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                    channel === 'MANUAL_TRANSFER'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="modalOfflineChannel"
                    value="MANUAL_TRANSFER"
                    checked={channel === 'MANUAL_TRANSFER'}
                    onChange={() => setChannel('MANUAL_TRANSFER')}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold">Transfer Bank BCA</span>
                </label>

                <label
                  className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                    channel === 'CASH'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="modalOfflineChannel"
                    value="CASH"
                    checked={channel === 'CASH'}
                    onChange={() => setChannel('CASH')}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold">Tunai / Direct Cash</span>
                </label>
              </div>
            </div>

            {/* Kategori Transaksi */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                4. Kategori Transaksi
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="B2B_CUSTOM_APP">Kontrak Custom App / B2B</option>
                <option value="SAAS_SUBSCRIPTION">Langganan Toko (SaaS)</option>
                <option value="SPECIAL_CASE">Layanan Khusus / Pilot</option>
              </select>
              <div className="text-[10px] text-slate-500 mt-1.5">
                Kategori menentukan pos pembukuan di General Ledger.
              </div>
            </div>
          </div>

          {/* 5. Nomor Referensi / SPK / Invoice (Auto-generate Default) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-300">
                5. Nomor Referensi / Invoice / SPK <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleRegenerateRef}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer"
                title="Generate ulang format INV/BT/YYYY/MM/XXXX"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Auto-Generate</span>
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Format default: INV/BT/YYYY/MM/XXXX"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Sistem otomatis meng-generate nomor resmi berformat <code>INV/BT/YYYY/MM/XXXX</code> jika dikosongkan.
            </span>
          </div>

          {/* 6. Catatan Internal / Keterangan */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              6. Catatan Internal / Keterangan Kontrak
            </label>
            <input
              type="text"
              placeholder="Contoh: Pembayaran termin 1 kontrak integrasi sistem klinik"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Tercatat otomatis ke <code>tenant_credit_ledger</code> dan <code>general_ledger</code> (Kas BCA vs Pendapatan B2B).
            </span>
          </div>

          {/* Toggle Auto-generate Invoice PDF */}
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoDownloadPdf}
                onChange={(e) => setAutoDownloadPdf(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-generate &amp; Unduh Invoice PDF Resmi (Mode PAID)</span>
              </span>
            </label>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              PDF v1.4
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              Batal
            </button>

            {/* Action 1: Standard Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !selectedTenant}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Simpan Transaksi (SETTLED)</span>
            </button>

            {/* Action 2: Save & Download Invoice PDF */}
            <button
              type="button"
              onClick={() => executePayment(true)}
              disabled={isSubmitting || !selectedTenant}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Memproses Transaksi...' : 'Simpan & Unduh Invoice PDF'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
