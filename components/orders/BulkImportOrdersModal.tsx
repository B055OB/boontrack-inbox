'use client';

import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Download,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  DollarSign,
} from 'lucide-react';

interface BulkImportOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  onImportSuccess?: (summary: any) => void;
}

export default function BulkImportOrdersModal({
  isOpen,
  onClose,
  tenantSlug,
  onImportSuccess,
}: BulkImportOrdersModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<{
    totalRows: number;
    validCount: number;
    errorCount: number;
    totalRevenue: number;
    errors: { row: number; reason: string }[];
    validRows: any[];
  } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [syncMetaCapi, setSyncMetaCapi] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper untuk membersihkan & memvalidasi row di sisi client untuk pratinjau cepat
  const parseAndPreviewFile = useCallback(async (selectedFile: File) => {
    setIsParsing(true);
    setErrorMessage(null);
    setUploadResult(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        throw new Error('Berkas tidak memiliki sheet data.');
      }

      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
      if (rawRows.length === 0) {
        throw new Error('Berkas kosong atau tidak memiliki baris data.');
      }

      const validRows: any[] = [];
      const errors: { row: number; reason: string }[] = [];
      let totalRevenue = 0;

      rawRows.forEach((row, idx) => {
        const rowNum = idx + 2;

        // Normalisasi key
        const norm: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          norm[k.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')] = v;
          norm[k] = v;
        }

        const name = String(norm.nama_pembeli || norm.nama || norm.customer_name || norm.pembeli || '').trim();
        const phone = String(norm.nomor_whatsapp || norm.no_hp || norm.telepon || norm.phone || norm.whatsapp || '').trim();
        const product = String(norm.nama_produk || norm.produk || norm.product_name || norm.product_title || '').trim();
        const rawNominal = norm.nominal ?? norm.total_harga ?? norm.harga ?? norm.total ?? norm.gross_amount ?? 0;

        if (!name) {
          errors.push({ row: rowNum, reason: 'Nama pembeli kosong' });
          return;
        }

        const cleanDigits = phone.replace(/\D/g, '');
        if (!cleanDigits || cleanDigits.length < 8) {
          errors.push({ row: rowNum, reason: `Nomor WhatsApp '${phone || 'kosong'}' tidak valid` });
          return;
        }

        if (!product) {
          errors.push({ row: rowNum, reason: 'Nama produk kosong' });
          return;
        }

        // Parse nominal
        let nominalStr = String(rawNominal).replace(/rp\.?/gi, '').replace(/\s+/g, '');
        if (nominalStr.includes('.') && nominalStr.includes(',')) {
          nominalStr = nominalStr.replace(/\./g, '').replace(',', '.');
        } else if (nominalStr.includes('.')) {
          const parts = nominalStr.split('.');
          if (parts[parts.length - 1].length === 3) nominalStr = nominalStr.replace(/\./g, '');
        } else if (nominalStr.includes(',')) {
          const parts = nominalStr.split(',');
          if (parts[parts.length - 1].length === 3) nominalStr = nominalStr.replace(/,/g, '');
          else nominalStr = nominalStr.replace(',', '.');
        }
        const parsedNominal = parseFloat(nominalStr.replace(/[^0-9.-]/g, ''));

        if (isNaN(parsedNominal) || parsedNominal <= 0) {
          errors.push({ row: rowNum, reason: `Nominal '${rawNominal}' tidak valid` });
          return;
        }

        validRows.push(row);
        totalRevenue += parsedNominal;
      });

      setFile(selectedFile);
      setPreview({
        totalRows: rawRows.length,
        validCount: validRows.length,
        errorCount: errors.length,
        totalRevenue,
        errors,
        validRows,
      });
    } catch (err: any) {
      console.warn('[BulkImportModal] Error parsing file:', err);
      setErrorMessage(err.message || 'Gagal membaca berkas. Pastikan format .xlsx atau .csv valid.');
      setFile(null);
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.toLowerCase();
      if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
        parseAndPreviewFile(droppedFile);
      } else {
        setErrorMessage('Format berkas tidak didukung. Harap unggah berkas .xlsx, .xls, atau .csv.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseAndPreviewFile(e.target.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !preview || preview.validCount === 0) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantSlug', tenantSlug);
      formData.append('syncMetaCapi', String(syncMetaCapi));

      const res = await fetch('/api/orders/bulk-import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Gagal memproses import pesanan.');
      }

      setUploadResult(data);
      if (onImportSuccess) {
        onImportSuccess(data.summary);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat mengunggah pesanan.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setUploadResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget && !isUploading) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Import Pesanan Massal (Excel / CSV)
              </h2>
              <p className="text-xs text-slate-500">
                Bukukan omset offline/WhatsApp langsung ke laporan keuangan & Meta CAPI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Skenario Sukses Selesai */}
          {uploadResult ? (
            <div className="space-y-5 text-center py-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">
                  Import Pesanan Berhasil!
                </h3>
                <p className="text-xs text-slate-600">
                  {uploadResult.message}
                </p>
              </div>

              {/* Rekap Finansial & Sinkronisasi */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Sukses Dibukukan</span>
                  <div className="text-lg font-black text-emerald-600">
                    {uploadResult.summary.total_success} Pesanan
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Omset</span>
                  <div className="text-lg font-black text-slate-900">
                    {uploadResult.summary.formatted_revenue}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Meta CAPI</span>
                  <div className="text-xs font-bold text-purple-700 mt-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {uploadResult.summary.meta_capi_status === 'DISPATCHED'
                        ? `${uploadResult.summary.meta_capi_synced} Event Terkirim`
                        : uploadResult.summary.meta_capi_status === 'SKIPPED_NO_PIXEL'
                        ? 'Dilewati (Tanpa Pixel)'
                        : 'Nonaktif'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Selesai & Segarkan Tabel Pesanan
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Alert Error */}
              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Drag and Drop Zone */}
              {!preview ? (
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                    dragActive
                      ? 'border-purple-600 bg-purple-50/50'
                      : 'border-slate-300 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/20'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Tarik & letakkan berkas Excel (.xlsx) atau CSV di sini
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      atau klik untuk menelusuri dari perangkat Anda
                    </p>
                  </div>

                  <span className="text-[11px] font-mono font-medium text-slate-400">
                    Maksimal 10 MB • Format kolom standar
                  </span>
                </div>
              ) : (
                /* Preview Ringkas Baris Valid vs Bermasalah */
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {file?.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Total {preview.totalRows} baris terdeteksi
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2.5 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                    >
                      Ganti Berkas
                    </button>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-left">
                      <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">
                        Siap Di-Import
                      </span>
                      <span className="text-base font-black text-emerald-700">
                        {preview.validCount} Baris Valid
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-left">
                      <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider block">
                        Bermasalah
                      </span>
                      <span className="text-base font-black text-rose-700">
                        {preview.errorCount} Baris
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-left">
                      <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider block">
                        Estimasi Omset
                      </span>
                      <span className="text-sm sm:text-base font-black text-purple-900 truncate block">
                        Rp {preview.totalRevenue.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* Error Breakdown Accordion */}
                  {preview.errorCount > 0 && (
                    <div className="border border-amber-200 rounded-2xl bg-amber-50/50 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                        className="w-full p-3 flex items-center justify-between text-amber-800 font-bold cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>{preview.errorCount} baris memiliki data tidak lengkap (akan dilewati)</span>
                        </span>
                        {showErrorDetails ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {showErrorDetails && (
                        <div className="p-3 pt-0 border-t border-amber-100 max-h-36 overflow-y-auto space-y-1.5 text-[11px] text-amber-900">
                          {preview.errors.map((err, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className="font-mono font-bold shrink-0">Baris {err.row}:</span>
                              <span>{err.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Opsi Checkbox Meta CAPI */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncMetaCapi}
                    onChange={e => setSyncMetaCapi(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-purple-600 border-slate-300 focus:ring-purple-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Kirim event Purchase ke Meta CAPI untuk data yang di-import
                    </span>
                    <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                      Data transaksi akan di-dispatch dengan <code className="font-mono text-purple-700 bg-purple-100 px-1 rounded">action_source: physical_store</code> dan nomor HP/nama ter-hash SHA-256 untuk mengoptimalkan Event Match Quality (EMQ).
                    </span>
                  </div>
                </label>
              </div>

              {/* Download Template Banner Link */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>Belum punya format kolom yang benar?</span>
                <a
                  href="/api/orders/bulk-import/template?format=xlsx"
                  download="template-import-pesanan-boontrack.xlsx"
                  className="text-purple-600 hover:text-purple-700 font-bold flex items-center gap-1 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template Excel</span>
                </a>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!uploadResult && (
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isUploading || isParsing || !preview || preview.validCount === 0}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses Import...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    Konfirmasi Simpan {preview ? `(${preview.validCount} Pesanan)` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
