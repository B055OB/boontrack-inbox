'use client';

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Sparkles,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { getBackendApiUrl } from '@/lib/api-config';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  onSuccess?: (totalImported: number) => void;
  refreshProducts?: () => Promise<any>;
}

export default function BulkImportModal({
  isOpen,
  onClose,
  tenantSlug,
  onSuccess,
  refreshProducts,
}: BulkImportModalProps) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total_imported: number;
    skipped: number;
    errors?: Array<any>;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isImporting) return;
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    onClose();
  };

  const handleBulkImport = async () => {
    if (!importFile || isImporting) return;

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const targetUrl = getBackendApiUrl(
        `/api/v1/products/bulk-upload?tenant_slug=${encodeURIComponent(tenantSlug)}`
      );

      let res: Response;
      try {
        res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'X-Tenant-ID': tenantSlug,
          },
          body: formData,
        });
      } catch (directErr) {
        console.warn('Direct upload to backend failed, trying local proxy:', directErr);
        res = await fetch(`/api/v1/products/bulk-upload?tenant_slug=${encodeURIComponent(tenantSlug)}`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!res.ok) {
        let errDetail = 'Gagal mengimpor file spreadsheet.';
        try {
          const errJson = await res.json();
          errDetail = errJson.detail || errJson.error || errJson.message || errDetail;
        } catch {
          const errText = await res.text();
          if (errText) errDetail = errText;
        }
        throw new Error(errDetail);
      }

      const data = await res.json();
      const totalImported = data.total_imported ?? 0;
      setImportResult({
        total_imported: totalImported,
        skipped: data.skipped ?? 0,
        errors: data.errors || [],
      });

      if (onSuccess) {
        onSuccess(totalImported);
      }

      if (refreshProducts) {
        await refreshProducts();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses file spreadsheet.';
      console.error('[Bulk Import Error]:', err);
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Import Massal Spreadsheet</h3>
              <p className="text-[11px] text-slate-400 font-medium">Format .xlsx, .xls, atau .csv (Tokopedia, Shopee, Excel standar)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200/60 transition disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-600 space-y-1.5">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Kolom Spreadsheet yang Didukung:
            </p>
            <ul className="list-disc list-inside text-[11px] text-slate-500 space-y-0.5">
              <li><span className="font-semibold text-slate-700">Wajib:</span> Nama Produk (Product Name, title), Harga (Price).</li>
              <li><span className="font-semibold text-slate-700">Opsional:</span> Stok (Stock, qty), Deskripsi (Description), Foto / Gambar.</li>
              <li>Mendukung impor ratusan SKU sekaligus secara instan ke etalase toko.</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Pilih File Spreadsheet (.csv, .xlsx, .xls)
            </label>

            <div className="relative border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 transition-all text-center bg-slate-50/50 hover:bg-blue-50/20 group cursor-pointer">
              <input
                type="file"
                accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                disabled={isImporting}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setImportFile(e.target.files[0]);
                    setImportResult(null);
                    setImportError(null);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />

              {importFile ? (
                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
                  <div className="flex items-center gap-3 text-left min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{importFile.name}</p>
                      <p className="text-[11px] text-slate-400">{(importFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImportFile(null);
                      setImportResult(null);
                      setImportError(null);
                    }}
                    disabled={isImporting}
                    className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-xs border border-slate-200 flex items-center justify-center mx-auto text-blue-600 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      Klik untuk memilih file atau seret file ke sini
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Format: .XLSX, .XLS, atau .CSV (Maks 15 MB)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isImporting && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 text-blue-800 animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin shrink-0 text-blue-600" />
              <div className="text-xs">
                <p className="font-bold">Sedang memproses ratusan SKU...</p>
                <p className="text-[11px] text-blue-600 mt-0.5">Sistem sedang memvalidasi data dan menyimpannya ke etalase katalog.</p>
              </div>
            </div>
          )}

          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <h4 className="text-xs font-bold">Import Produk Berhasil!</h4>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Total <span className="font-black text-emerald-900">{importResult.total_imported}</span> produk berhasil ditambahkan ke katalog etalase.
                {importResult.skipped > 0 && (
                  <span> ({importResult.skipped} baris dilewati karena kosong atau format tidak sesuai).</span>
                )}
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-700 max-h-24 overflow-y-auto space-y-1">
                  <p className="font-semibold">Catatan baris yang dilewati:</p>
                  {importResult.errors.slice(0, 5).map((err: any, idx: number) => (
                    <p key={idx} className="truncate">
                      • Baris {err.row || idx + 2}: {err.error || err.product || JSON.stringify(err)}
                    </p>
                  ))}
                  {importResult.errors.length > 5 && (
                    <p className="italic">...dan {importResult.errors.length - 5} baris lainnya.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {importError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-900 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">Gagal Mengimpor File</p>
                <p className="text-[11px] text-rose-700 leading-normal">{importError}</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition disabled:opacity-50 cursor-pointer"
          >
            {importResult ? 'Selesai' : 'Batal'}
          </button>

          {!importResult && (
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={!importFile || isImporting}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengimpor...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Mulai Import Produk</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
