'use client';

import React, { useState, useMemo } from 'react';
import {
  Wallet,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  FileText,
  Download,
  Clock,
  X,
  Loader2,
  Calendar,
} from 'lucide-react';
import { TransactionItem } from '@/lib/product-catalog';
import DateRangePicker, { DateRangeState, getDateRangeFromPreset } from '../DateRangePicker';

export interface OverviewTabProps {
  totalOmzet: number;
  readyBalance: number;
  bankForm: {
    name: string;
    account: string;
    holder: string;
  };
  setBankForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      account: string;
      holder: string;
    }>
  >;
  displayName: string;
  transactions: TransactionItem[];
  isWithdrawModalOpen: boolean;
  setIsWithdrawModalOpen: (open: boolean) => void;
  withdrawAmount: number;
  setWithdrawAmount: (amount: number) => void;
  handleProcessWithdraw: (e: React.FormEvent) => void;
  isWithdrawing?: boolean;
}

export default function OverviewTab({
  totalOmzet,
  readyBalance,
  bankForm,
  setBankForm,
  displayName,
  transactions,
  isWithdrawModalOpen,
  setIsWithdrawModalOpen,
  withdrawAmount,
  setWithdrawAmount,
  handleProcessWithdraw,
  isWithdrawing = false,
}: OverviewTabProps) {
  const [dateRange, setDateRange] = useState<DateRangeState>(() => getDateRangeFromPreset('all'));

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    if (!dateRange.startDate && !dateRange.endDate) return transactions;
    const startMs = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
    const endMs = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Infinity;

    return transactions.filter((t: any) => {
      const createdMs = new Date(t.created_at || t.date || Date.now()).getTime();
      return createdMs >= startMs && createdMs <= endMs;
    });
  }, [transactions, dateRange]);

  const filteredOmzet = useMemo(() => {
    if (!dateRange.startDate && !dateRange.endDate) {
      return totalOmzet;
    }
    return filteredTransactions
      .filter((t: any) => ['PAID', 'COMPLETED', 'SETTLEMENT', 'SUCCESS', 'LUNAS'].includes((t.status || t.payment_status || '').toUpperCase()))
      .reduce((sum: number, t: any) => sum + Number(t.gross_amount || t.total_amount || t.amount || 0), 0);
  }, [filteredTransactions, dateRange, totalOmzet]);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <span>Ringkasan Keuangan & Laporan Penjualan</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pantau mutasi pembayaran QRIS otomatis, saldo siap cair, serta kelola rekening penarikan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* Global Date Range Picker */}
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <button
            type="button"
            onClick={() => setIsWithdrawModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Tarik Saldo Toko</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              Total Omzet Masuk {dateRange.preset !== 'all' ? `(${dateRange.label})` : ''}
            </span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            Rp {filteredOmzet.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {dateRange.preset !== 'all' ? `Periode: ${dateRange.label}` : 'Akumulasi seluruh transaksi sukses'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Saldo Siap Tarik</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            Rp {readyBalance.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium">
            Dana bersih realtime di rekening penampung
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Rekening Tujuan</span>
            <span className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {bankForm.name || 'Belum Ditetapkan'}
          </div>
          <p className="text-[11px] text-slate-500 font-mono font-bold truncate">
            {bankForm.account
              ? `${bankForm.account} • ${bankForm.holder || displayName.toUpperCase()}`
              : 'Atur nomor rekening di bawah'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Riwayat Transaksi & Invoice Pembeli</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={() => alert('Mengekspor laporan penjualan ke file CSV...')}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[640px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Invoice / Waktu</th>
                <th className="px-5 py-3.5">Pembeli</th>
                <th className="px-5 py-3.5">Produk</th>
                <th className="px-5 py-3.5">Metode</th>
                <th className="px-5 py-3.5 text-right">Nominal</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                        <FileText className="w-5 h-5 text-slate-400" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">
                        Belum ada transaksi masuk pada periode ini.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {dateRange.preset !== 'all'
                          ? `Tidak ditemukan transaksi untuk periode: ${dateRange.label}`
                          : 'Transaksi dari checkout etalase atau WhatsApp akan tercatat otomatis di sini.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t: any) => {
                  const invoiceNo = t.invoice_no || t.id;
                  const dateVal = t.date || t.created_at;
                  const customerName = t.customer_name || t.customerName || 'Pelanggan';
                  const customerPhone = t.customer_phone || t.customerPhone;
                  const productTitle = t.product_title || t.product_name || t.productTitle || t.items_summary || 'Produk Digital';
                  const grossAmount = Number(t.gross_amount ?? t.amount ?? t.total_amount ?? 0);
                  const status = t.status || t.payment_status || 'PENDING';
                  const isPaid = ['PAID', 'COMPLETED', 'SETTLEMENT', 'SUCCESS', 'LUNAS'].includes(String(status).toUpperCase());
                  const paymentMethod = t.payment_method || t.paymentMethod || 'QRIS Dinamis';

                  return (
                    <tr key={t.id || invoiceNo} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 font-mono">{invoiceNo}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {typeof dateVal === 'string' && dateVal.includes('T') ? new Date(dateVal).toLocaleDateString('id-ID') : (dateVal || '-')}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-800">{customerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{customerPhone ? (String(customerPhone).startsWith('+') ? customerPhone : `+${customerPhone}`) : '-'}</div>
                      </td>
                      <td className="px-5 py-4 max-w-[220px]">
                        <div className="truncate font-semibold text-slate-900" title={productTitle}>{productTitle}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono">
                          {paymentMethod}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-black text-slate-900 font-mono whitespace-nowrap">
                        Rp {Math.round(grossAmount).toLocaleString('id-ID')}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black border ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {isPaid ? 'LUNAS (PAID)' : 'PENDING'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => alert(`Membuka lembar Invoice Resmi untuk ${invoiceNo}`)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg font-bold text-[11px] transition cursor-pointer"
                        >
                          Invoice
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
          Ubah Data Rekening Bank Toko
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Bank</label>
            <input
              type="text"
              value={bankForm.name}
              onChange={(e) => setBankForm((b) => ({ ...b, name: e.target.value }))}
              placeholder="Contoh: BCA / Mandiri / BRI"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Nomor Rekening</label>
            <input
              type="text"
              value={bankForm.account}
              onChange={(e) => setBankForm((b) => ({ ...b, account: e.target.value }))}
              placeholder="Contoh: 1234567890"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Pemilik Rekening</label>
            <input
              type="text"
              value={bankForm.holder}
              onChange={(e) => setBankForm((b) => ({ ...b, holder: e.target.value }))}
              placeholder="Nama sesuai buku tabungan"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 uppercase font-bold"
            />
          </div>
        </div>
      </div>

      {/* MODAL TARIK SALDO */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>Tarik Saldo Penjualan ke Rekening</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsWithdrawModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessWithdraw} className="p-6 space-y-4">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <span className="text-xs text-emerald-800 font-medium">Saldo Tersedia</span>
                <div className="text-xl font-black text-emerald-700 mt-0.5">
                  Rp {readyBalance.toLocaleString('id-ID')}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nominal Penarikan (Rp)</label>
                <input
                  type="number"
                  required
                  min={50000}
                  max={readyBalance}
                  value={withdrawAmount || ''}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  placeholder="Min. 50.000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Minimal penarikan dana Rp 50.000</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="font-bold text-slate-800">Transfer Ditujukan ke:</div>
                <div className="text-slate-600 font-mono">
                  {bankForm.name} - {bankForm.account}
                </div>
                <div className="text-slate-500 font-bold uppercase">a.n {bankForm.holder || displayName}</div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={readyBalance < 50000 || isWithdrawing}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Memproses Transfer...</span>
                    </>
                  ) : (
                    <span>Konfirmasi Penarikan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
