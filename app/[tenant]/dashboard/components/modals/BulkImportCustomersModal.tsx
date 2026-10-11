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
  Users,
  Target,
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldCheck,
} from 'lucide-react';

interface BulkImportCustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  onSuccess?: (summary: { total_success: number; total_failed: number; batch_id: string }) => void;
}

export default function BulkImportCustomersModal({
  isOpen,
  onClose,
  tenantSlug,
  onSuccess,
}: BulkImportCustomersModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<{
    totalRows: number;
    validCount: number;
    errorCount: number;
    errors: { row: number; reason: string }[];
    validRows: any[];
  } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Helper: Sanitasi nomor telepon sesuai format Meta Custom Audience & WhatsApp Indonesia
   */
  const sanitizePhoneClient = (rawVal: any): { normalized: string | null; error?: string } => {
    if (!rawVal) return { normalized: null, error: 'Nomor WhatsApp kosong' };
    let digits = String(rawVal).trim().replace(/\D/g, '');
    if (!digits) return { normalized: null, error: 'Nomor tidak memuat angka' };

    if (digits.startsWith('0062')) digits = digits.slice(2);

    if (digits.startsWith('08')) {
      digits = '628' + digits.slice(2);
    } else if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    } else if (digits.startsWith('8')) {
      digits = '62' + digits;
    }

    if (digits.length < 9) {
      return { normalized: null, error: `Nomor '${rawVal}' terlalu pendek (min 9 digit)` };
    }
    if (digits.length > 16) {
      return { normalized: null, error: `Nomor '${rawVal}' terlalu panjang (max 16 digit)` };
    }

    return { normalized: digits };
  };

  /**
   * Parsing client-side untuk pratinjau cepat
   */
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

      rawRows.forEach((row, idx) => {
        const rowNum = idx + 2;

        // Normalisasi key
        const norm: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          const lower = k.trim().toLowerCase();
          norm[lower] = v;
          norm[lower.replace(/[^a-z0-9]/g, '_')] = v;
          norm[lower.replace(/\s+/g, '')] = v;
          norm[k] = v;
        }

        // 1. Nama
        const name = String(
          row['Nama'] ??
          row['nama'] ??
          row['Nama Lengkap'] ??
          row['nama_lengkap'] ??
          row['name'] ??
          row['customer_name'] ??
          norm['nama'] ??
          norm['nama_lengkap'] ??
          norm['name'] ??
          norm['customer_name'] ??
          ''
        ).trim();

        // 2. Nomor WhatsApp
        const rawPhone =
          row['Nomor WhatsApp'] ??
          row['nomor_whatsapp'] ??
          row['whatsapp'] ??
          row['phone'] ??
          norm['nomor whatsapp'] ??
          norm['nomor_whatsapp'] ??
          norm['whatsapp'] ??
          norm['phone'] ??
          norm['no_hp'] ??
          norm['telepon'] ??
          '';

        const phoneCheck = sanitizePhoneClient(rawPhone);

        // 3. Kota / Kabupaten (Mendukung alias: kota, city, kabupaten, kab_kota)
        const city = String(
          row['Kota'] ??
          row['kota'] ??
          row['City'] ??
          row['city'] ??
          row['Kabupaten'] ??
          row['kabupaten'] ??
          row['kab_kota'] ??
          norm['kota'] ??
          norm['city'] ??
          norm['kabupaten'] ??
          norm['kab_kota'] ??
          norm['kab/kota'] ??
          norm['kabkota'] ??
          norm['kota_kabupaten'] ??
          ''
        ).trim();

        // 4. Email
        let email = String(
          row['Email'] ??
          row['email'] ??
          norm['email'] ??
          norm['surel'] ??
          ''
        ).trim().toLowerCase();
        if (email && (!email.includes('@') || !email.includes('.'))) {
          email = '';
        }

        if (!name) {
          errors.push({ row: rowNum, reason: 'Nama pelanggan wajib diisi' });
          return;
        }

        if (!phoneCheck.normalized) {
          errors.push({
            row: rowNum,
            reason: phoneCheck.error || `Nomor WhatsApp '${rawPhone || 'kosong'}' tidak valid`,
          });
          return;
        }

        validRows.push({
          row: rowNum,
          name,
          phone: phoneCheck.normalized,
          email,
          city,
        });
      });

      setFile(selectedFile);
      setPreview({
        totalRows: rawRows.length,
        validCount: validRows.length,
        errorCount: errors.length,
        errors,
        validRows,
      });
    } catch (err: any) {
      console.warn('[BulkImportCustomersModal] Error parsing file:', err);
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

      const res = await fetch('/api/customers/bulk-import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Gagal memproses import pelanggan.');
      }

      setUploadResult(data);
      if (onSuccess) {
        onSuccess(data.summary);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat mengunggah daftar pelanggan.');
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
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Import Daftar Pelanggan
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Meta CA Ready
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Upload CSV / Excel untuk sinkronisasi kontak CRM &amp; Meta Custom Audience
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Skenario Sukses */}
          {uploadResult ? (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Import Pelanggan Berhasil!
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {uploadResult.message}
                </p>
              </div>

              {/* Rekap Import */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Kontak Tersimpan</span>
                  <div className="text-xl font-black text-emerald-600">
                    {uploadResult.summary.total_success} Kontak
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Batch ID</span>
                  <div className="text-xs font-mono font-bold text-slate-700 mt-1 truncate">
                    {uploadResult.summary.batch_id}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Selesai &amp; Segarkan Database Pelanggan
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
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Tarik &amp; letakkan berkas Excel (.xlsx) atau CSV di sini
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      atau klik untuk menelusuri dari perangkat Anda
                    </p>
                  </div>

                  <span className="text-[11px] font-mono font-medium text-slate-400">
                    Kolom standar: Nama, Nomor WhatsApp, Email, Kota
                  </span>
                </div>
              ) : (
                /* Preview Ringkas Baris Valid vs Bermasalah */
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-left">
                      <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">
                        Siap Di-Import
                      </span>
                      <span className="text-base font-black text-emerald-700">
                        {preview.validCount} Baris
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-left">
                      <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider block">
                        Dilewati / Invalid
                      </span>
                      <span className="text-base font-black text-amber-800">
                        {preview.errorCount} Baris
                      </span>
                    </div>
                  </div>

                  {/* Error Accordion */}
                  {preview.errorCount > 0 && (
                    <div className="border border-amber-200 rounded-2xl overflow-hidden bg-amber-50/40">
                      <button
                        type="button"
                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-amber-900 hover:bg-amber-100/50 transition cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          Detail {preview.errorCount} baris yang dilewati (tidak menggagalkan import)
                        </span>
                        {showErrorDetails ? (
                          <ChevronUp className="w-4 h-4 text-amber-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-amber-600" />
                        )}
                      </button>

                      {showErrorDetails && (
                        <div className="max-h-40 overflow-y-auto px-4 py-2 border-t border-amber-200 space-y-1.5 bg-white text-left">
                          {preview.errors.map((err, i) => (
                            <div key={i} className="text-[11px] text-slate-600 flex items-start gap-2">
                              <span className="font-mono font-bold text-rose-600 shrink-0">
                                Baris {err.row}:
                              </span>
                              <span>{err.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pratinjau Tabel Ringkas (Maks 3 Data Valid) */}
                  {preview.validRows.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden text-left">
                      <div className="px-3.5 py-2 bg-slate-100/80 text-[11px] font-bold text-slate-700 border-b border-slate-200">
                        Contoh Data Valid Terbaca:
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        {preview.validRows.slice(0, 3).map((r, i) => (
                          <div key={i} className="p-3 bg-white flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{r.name}</p>
                              <p className="text-[11px] text-slate-500 font-mono">
                                WA: {r.phone} {r.city ? `• Kota: ${r.city}` : ''}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                              Valid
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fitur Auto-Sanitizer & Meta CA Assurance */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold">Auto-Sanitizer Aktif: </span>
                  Nomor berawalan <code className="bg-indigo-100 px-1 py-0.2 rounded font-mono text-indigo-800">08xxx</code> atau <code className="bg-indigo-100 px-1 py-0.2 rounded font-mono text-indigo-800">8xxx</code> (akibat format Excel) otomatis dinormalisasi menjadi <code className="bg-indigo-100 px-1 py-0.2 rounded font-mono text-indigo-800">628xxx</code>. Karakter non-digit dibersihkan otomatis.
                </div>
              </div>

              {/* Download Template Banner Links */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pt-1 gap-2">
                <span>Belum punya format template yang sesuai?</span>
                <div className="flex items-center gap-3">
                  <a
                    href="/api/customers/bulk-import/template?format=xlsx"
                    download="template-customer-audience-meta.xlsx"
                    className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Template Excel (.xlsx)</span>
                  </a>
                  <span className="text-slate-300">•</span>
                  <a
                    href="/api/customers/bulk-import/template?format=csv"
                    download="template-customer-audience-meta.csv"
                    className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </a>
                </div>
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
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengimpor Pelanggan...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    Konfirmasi Simpan {preview ? `(${preview.validCount} Kontak)` : ''}
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
