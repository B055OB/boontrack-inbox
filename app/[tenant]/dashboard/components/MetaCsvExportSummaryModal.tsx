'use client';

/**
 * @file app/[tenant]/dashboard/components/MetaCsvExportSummaryModal.tsx
 * @description Modal dialog for displaying Meta CSV Export skip summary and audit details to dashboard operators.
 * Strictly adheres to Zero Silent Fallback & P0 Meta CAPI Integrity.
 */

import React from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
} from 'lucide-react';
import type { MetaCsvExportSummary } from '@/lib/utils/orderFulfillment';

export interface MetaCsvExportSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: MetaCsvExportSummary | null;
}

export function MetaCsvExportSummaryModal({
  isOpen,
  onClose,
  summary,
}: MetaCsvExportSummaryModalProps) {
  if (!isOpen || !summary) return null;

  const isFailedZeroExport = summary.exportedRows === 0;
  const hasSkippedRows = summary.skippedRows > 0;
  const isFullSuccess = summary.exportedRows > 0 && !hasSkippedRows;

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'invalid_date':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
            Tanggal Tidak Valid
          </span>
        );
      case 'missing_date':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            Tanggal Kosong
          </span>
        );
      case 'invalid_amount':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
            Nominal Tidak Valid
          </span>
        );
      case 'missing_amount':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            Nominal Kosong
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border border-zinc-500/20">
            {reason}
          </span>
        );
    }
  };

  return (
    <div
      id="meta-csv-export-summary-modal"
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isFailedZeroExport
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : hasSkippedRows
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isFailedZeroExport ? (
                <XCircle className="w-5 h-5" />
              ) : hasSkippedRows ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3
                id="export-summary-title"
                className="font-bold text-sm text-foreground flex items-center gap-2"
              >
                <span>Rekapitulasi Ekspor Meta CSV</span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isFailedZeroExport
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                      : hasSkippedRows
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {isFailedZeroExport
                    ? 'Ekspor Gagal'
                    : hasSkippedRows
                    ? 'Perhatian: Ada Data Dilewati'
                    : '100% Berhasil'}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit integritas Meta Offline Events Manager & Conversions API
              </p>
            </div>
          </div>
          <button
            type="button"
            id="export-summary-close-x-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div
              id="summary-total-processed"
              className="p-3.5 bg-muted/30 rounded-2xl border border-border text-center"
            >
              <span className="text-[11px] font-semibold text-muted-foreground block">
                Total Diproses
              </span>
              <span className="text-xl font-black text-foreground font-mono mt-1 block">
                {summary.totalRows}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                pesanan
              </span>
            </div>

            <div
              id="summary-total-exported"
              className={`p-3.5 rounded-2xl border text-center ${
                summary.exportedRows > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
                  : 'bg-muted/20 border-border text-muted-foreground'
              }`}
            >
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                Berhasil Diekspor
              </span>
              <span className="text-xl font-black font-mono mt-1 block text-emerald-600 dark:text-emerald-400">
                {summary.exportedRows}
              </span>
              <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 block">
                baris CSV
              </span>
            </div>

            <div
              id="summary-total-skipped"
              className={`p-3.5 rounded-2xl border text-center ${
                summary.skippedRows > 0
                  ? isFailedZeroExport
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-100'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100'
                  : 'bg-muted/20 border-border text-muted-foreground'
              }`}
            >
              <span
                className={`text-[11px] font-semibold block ${
                  summary.skippedRows > 0
                    ? isFailedZeroExport
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-amber-700 dark:text-amber-300'
                    : 'text-muted-foreground'
                }`}
              >
                Dilewati (Invalid)
              </span>
              <span
                className={`text-xl font-black font-mono mt-1 block ${
                  summary.skippedRows > 0
                    ? isFailedZeroExport
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
                }`}
              >
                {summary.skippedRows}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                pesanan ditolak
              </span>
            </div>
          </div>

          {/* Alert Banners */}
          {isFailedZeroExport && (
            <div
              id="export-summary-empty-state"
              className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/30 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-3 animate-in fade-in"
            >
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-rose-950 dark:text-rose-100 block">
                  Ekspor Gagal: Tidak Ada Data Valid yang Dapat Diekspor
                </span>
                <p className="leading-relaxed text-[11px] text-rose-800 dark:text-rose-300">
                  {summary.totalRows === 0 ? (
                    'Tidak ada data pesanan yang dipilih atau ditemukan untuk diekspor. Unduhan CSV tidak dijalankan.'
                  ) : (
                    <>
                      Seluruh {summary.totalRows} pesanan yang dipilih memiliki data
                      cacat/tidak valid (tanggal tidak valid/kosong atau nominal
                      tidak valid/0). <strong>Unduhan CSV tidak dijalankan</strong>{' '}
                      untuk mencegah pengiriman data sampah ke Meta Ads Manager.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {!isFailedZeroExport && hasSkippedRows && (
            <div
              id="export-summary-partial-state"
              className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3 animate-in fade-in"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-amber-950 dark:text-amber-100 block">
                  Unduhan CSV Selesai dengan Catatan
                </span>
                <p className="leading-relaxed text-[11px] text-amber-800 dark:text-amber-300">
                  Sebanyak <strong>{summary.exportedRows} pesanan valid</strong>{' '}
                  telah berhasil diekspor dan diunduh ke browser Anda. Namun,
                  terdapat <strong>{summary.skippedRows} pesanan</strong> yang
                  dilewati karena tidak memenuhi kontrak validasi Meta CAPI.
                </p>
              </div>
            </div>
          )}

          {isFullSuccess && (
            <div
              id="export-summary-full-success"
              className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-3 animate-in fade-in"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-emerald-950 dark:text-emerald-100 block">
                  Unduhan CSV Berhasil Sempurna
                </span>
                <p className="leading-relaxed text-[11px] text-emerald-800 dark:text-emerald-300">
                  Seluruh <strong>{summary.exportedRows} pesanan</strong> valid
                  dan berhasil diekspor tanpa ada satu pun baris yang dilewati.
                </p>
              </div>
            </div>
          )}

          {/* Skipped Details Table */}
          {hasSkippedRows && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <span>Rincian Baris yang Dilewati ({summary.skippedRows})</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Perbaiki data pesanan berikut agar dapat diekspor
                </span>
              </div>

              <div
                id="export-summary-skipped-table"
                className="rounded-2xl border border-border overflow-hidden max-h-56 overflow-y-auto bg-muted/10 text-xs"
              >
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-2.5 px-3">Order / Invoice ID</th>
                      <th className="py-2.5 px-3">Kategori Masalah</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.skippedDetails.map((detail, idx) => (
                      <tr
                        key={`${detail.orderId}-${idx}`}
                        className="hover:bg-muted/20 transition"
                      >
                        <td className="py-2 px-3 font-mono font-bold text-foreground">
                          {detail.orderId || '-'}
                        </td>
                        <td className="py-2 px-3">
                          {getReasonBadge(detail.reason)}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-muted-foreground leading-snug">
                          <span>{detail.message}</span>
                          {(detail.rawDate !== undefined ||
                            detail.rawValue !== undefined) && (
                            <span className="block font-mono text-[10px] text-muted-foreground/75 mt-0.5">
                              Nilai mentah:{' '}
                              {String(
                                detail.rawDate !== undefined
                                  ? detail.rawDate
                                  : detail.rawValue
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2.5">
          <button
            type="button"
            id="export-summary-close-btn"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition cursor-pointer shadow-sm"
          >
            {isFailedZeroExport ? 'Tutup & Periksa Data' : 'Selesai'}
          </button>
        </div>
      </div>
    </div>
  );
}
