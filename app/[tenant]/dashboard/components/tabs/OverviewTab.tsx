'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { TransactionItem } from '@/lib/product-catalog';
import DateRangePicker, { DateRangeState, getDateRangeFromPreset } from '../DateRangePicker';
import {
  calculateFinancialMetrics,
  isValidPaidStatus,
  isPendingVerificationStatus,
  formatWIBDateTime,
  extractOrderAmount,
} from '@/lib/finance-engine';
import { getStorefrontInvoiceUrl } from '@/lib/storefront-urls';
import { exportOrdersToMetaCsv } from '@/lib/utils/orderFulfillment';

export interface OverviewTabProps {
  totalOmzet: number;
  readyBalance: number;
  displayName: string;
  transactions: TransactionItem[];
  isWithdrawModalOpen: boolean;
  setIsWithdrawModalOpen: (open: boolean) => void;
  withdrawAmount: number;
  setWithdrawAmount: (amount: number) => void;
  handleProcessWithdraw: (e: React.FormEvent) => void;
  isWithdrawing?: boolean;
  tenantSlug?: string;
  onOrderUpdated?: (order: any) => void;
}

export default function OverviewTab({
  totalOmzet,
  readyBalance,
  displayName,
  transactions,
  isWithdrawModalOpen,
  setIsWithdrawModalOpen,
  withdrawAmount,
  setWithdrawAmount,
  handleProcessWithdraw,
  isWithdrawing = false,
  tenantSlug,
  onOrderUpdated,
}: OverviewTabProps) {
  const [dateRange, setDateRange] = useState<DateRangeState>(() => getDateRangeFromPreset('all'));
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING_VERIFICATION' | 'PENDING'>('ALL');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activeBankAccounts, setActiveBankAccounts] = useState<{ bank_name: string; account_number: string; account_holder: string }[]>([]);

  // Financial Metrics dynamically calculated by universal finance engine
  const financialMetrics = useMemo(() => {
    return calculateFinancialMetrics(Array.isArray(transactions) ? transactions : [], {
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
    });
  }, [transactions, dateRange.startDate, dateRange.endDate]);

  // Load active bank accounts from Supabase for withdraw modal display
  useEffect(() => {
    let mounted = true;
    async function loadBankAccounts() {
      if (!tenantSlug) return;
      try {
        const { getSupabase } = await import('@/lib/supabaseClient');
        const supabase = getSupabase();
        if (!supabase) return;
        const { data } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();
        const meta = data?.metadata || {};
        const rawAccounts = Array.isArray(meta.bank_accounts) && meta.bank_accounts.length > 0
          ? meta.bank_accounts
          : (meta.bank_transfer || meta.bank_settings ? [meta.bank_transfer || meta.bank_settings] : []);

        if (mounted && rawAccounts.length > 0) {
          const accounts = (rawAccounts as any[])
            .filter((a: any) => a && a.is_active !== false && (a.account_number || a.account))
            .map((a: any) => ({
              bank_name: a.bank_name || a.name || 'Bank Transfer',
              account_number: a.account_number || a.account || '',
              account_holder: a.account_holder || a.holder || '',
            }));
          setActiveBankAccounts(accounts);
        }
      } catch (e) {
        console.debug('[OverviewTab] Could not load bank accounts:', e);
      }
    }
    loadBankAccounts();
    return () => { mounted = false; };
  }, [tenantSlug]);

  const effectiveOmzet = financialMetrics.totalRevenue > 0 ? financialMetrics.totalRevenue : (!dateRange.startDate && !dateRange.endDate && totalOmzet > 0 ? totalOmzet : 0);

  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    const startMs = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
    const endMs = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Infinity;

    return transactions.filter((t: any) => {
      const createdMs = new Date(t.created_at || t.date || Date.now()).getTime();
      const inDateRange = createdMs >= startMs && createdMs <= endMs;
      if (!inDateRange) return false;

      const rawStatus = t.status || t.payment_status;
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'PAID') return isValidPaidStatus(rawStatus);
      if (statusFilter === 'PENDING_VERIFICATION') return isPendingVerificationStatus(rawStatus);
      if (statusFilter === 'PENDING') return !isValidPaidStatus(rawStatus) && !isPendingVerificationStatus(rawStatus);

      return true;
    });
  }, [transactions, dateRange, statusFilter]);

  // Action: Tandai Lunas order manual yang berstatus ORDER_PENDING_VERIFICATION
  const handleVerifyManualOrder = async (order: any) => {
    const orderId = order.id || order.order_id || order.invoice_no;
    if (!orderId) return;

    setVerifyingId(String(orderId));
    try {
      const updatedOrder = {
        ...order,
        status: 'PAID',
        payment_status: 'PAID',
        verified_at: new Date().toISOString(),
      };

      if (onOrderUpdated) {
        onOrderUpdated(updatedOrder);
      }

      if (tenantSlug) {
        await fetch(
          `/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${encodeURIComponent(orderId)}/quick-paid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        ).catch(() => null);
      }
    } catch (err) {
      console.warn('Verifikasi order manual note:', err);
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 relative z-20 overflow-visible">
        <div>
          <h2 className="text-lg font-black text-foreground flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Laporan Keuangan &amp; Omzet Multi-Vertical</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pusat audit pendapatan riil, agregasi multi-vertikal (Jasa, FnB, Digital, Fisik), dan penarikan saldo merchant.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto relative z-30 overflow-visible">
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

      {/* METRIC CARDS: 4-COLUMN RESPONSIVE GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TOTAL OMZET */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400 text-xs font-bold">
              Total Omzet Masuk {dateRange.preset !== 'all' ? `(${dateRange.label})` : ''}
            </span>
            <span className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50">
            Rp {Math.round(effectiveOmzet).toLocaleString('id-ID')}
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">
            {dateRange.preset !== 'all' ? `Periode: ${dateRange.label}` : 'Akumulasi seluruh transaksi lunas (WIB)'}
          </p>
        </div>

        {/* 2. TRANSAKSI SUKSES & AOV */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400 text-xs font-bold">Transaksi Berhasil &amp; AOV</span>
            <span className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50">
            {financialMetrics.totalSuccessfulOrders}{' '}
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Order</span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">
            AOV: Rp {Math.round(financialMetrics.aov).toLocaleString('id-ID')} / pesanan
          </p>
        </div>

        {/* 3. MENUNGGU VERIFIKASI */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'PENDING_VERIFICATION' ? 'ALL' : 'PENDING_VERIFICATION')}
          className={`p-5 rounded-xl border transition cursor-pointer space-y-2 ${
            statusFilter === 'PENDING_VERIFICATION'
              ? 'bg-amber-500/10 border-amber-500/30 ring-2 ring-amber-500/20 shadow-xs'
              : 'bg-card border-border shadow-xs hover:border-zinc-400 dark:hover:border-zinc-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400 text-xs font-bold">Menunggu Verifikasi</span>
            <span className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50">
            {financialMetrics.pendingVerificationCount}{' '}
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Order</span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">
            Rp {Math.round(financialMetrics.pendingVerificationAmount).toLocaleString('id-ID')} (Pending Manual)
          </p>
        </div>

        {/* 4. SALDO SIAP TARIK */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400 text-xs font-bold">Saldo Siap Tarik</span>
            <span className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50">
            Rp {Math.round(readyBalance).toLocaleString('id-ID')}
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">
            Dana bersih realtime di rekening penampung
          </p>
        </div>
      </div>

      {/* TABEL RIWAYAT TRANSAKSI DENGAN STATUS FILTER */}
      <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-muted/40">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Riwayat Transaksi &amp; Invoice Pembeli</span>
            </h3>
          </div>

          {/* Quick Filter Tabs */}
          <div className="inline-flex p-1 bg-muted border border-border rounded-xl items-center text-xs font-bold gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-card text-foreground border border-border shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Semua ({Array.isArray(transactions) ? transactions.length : 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PAID')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                statusFilter === 'PAID'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400'
              }`}
            >
              Lunas ({financialMetrics.totalSuccessfulOrders})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING_VERIFICATION')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                statusFilter === 'PENDING_VERIFICATION'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              Menunggu Verifikasi ({financialMetrics.pendingVerificationCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-muted-foreground/20 text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pending Bayar ({financialMetrics.pendingPaymentCount})
            </button>
          </div>

          <button
            type="button"
            id="overview-export-meta-csv-btn"
            onClick={() => exportOrdersToMetaCsv(filteredTransactions, tenantSlug || 'default')}
            className="px-3 py-1.5 bg-card hover:bg-muted border border-border text-foreground font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[640px] text-left border-collapse text-sm text-foreground bg-card">
            <thead>
              <tr className="bg-muted/50 text-zinc-700 dark:text-zinc-300 font-semibold text-xs tracking-wider uppercase border-b border-border">
                <th className="py-3 px-4">INVOICE / WAKTU (WIB)</th>
                <th className="py-3 px-4">PELANGGAN</th>
                <th className="py-3 px-4">PRODUK / LAYANAN</th>
                <th className="py-3 px-4">METODE</th>
                <th className="py-3 px-4 text-right">NOMINAL</th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th className="py-3 px-4 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-sans">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                      <div className="w-10 h-10 rounded-2xl bg-muted border border-border flex items-center justify-center text-muted-foreground mb-1">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-xs font-bold text-foreground">
                        Belum ada transaksi pada kriteria filter ini.
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {statusFilter !== 'ALL'
                          ? `Tidak ditemukan pesanan dengan status filter: ${statusFilter}`
                          : 'Transaksi dari checkout etalase atau WhatsApp akan tercatat otomatis di sini.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t: any) => {
                  const invoiceNo = t.invoice_no || t.id || t.order_id;
                  const dateVal = t.created_at || t.date || t.updated_at;
                  const customerName = t.customer_name || t.customerName || 'Pelanggan Toko';
                  const customerPhone = t.customer_phone || t.customerPhone;
                  const productTitle = t.product_title || t.product_name || t.productTitle || t.items_summary || 'Pesanan Produk';
                  const grossAmount = extractOrderAmount(t);
                  const rawStatus = t.status || t.payment_status || 'PENDING';
                  const isPaid = isValidPaidStatus(rawStatus);
                  const isPendingVerif = isPendingVerificationStatus(rawStatus);
                  const paymentMethod = t.payment_method || t.paymentMethod || 'QRIS Dinamis';

                  return (
                    <tr key={t.id || invoiceNo} className="border-b border-border text-foreground text-sm hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">{invoiceNo}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {formatWIBDateTime(dateVal)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{customerName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {customerPhone ? (String(customerPhone).startsWith('+') ? customerPhone : `+${customerPhone}`) : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 max-w-[220px]">
                        <div className="truncate font-semibold text-foreground" title={productTitle}>{productTitle}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[11px] text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded font-mono">
                          {paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-zinc-900 dark:text-zinc-50 font-mono whitespace-nowrap">
                        Rp {Math.round(grossAmount).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800'
                              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800'
                          }`}
                        >
                          {isPaid
                            ? 'PAID'
                            : isPendingVerif
                            ? 'PENDING VERIFIKASI'
                            : 'PENDING'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {isPendingVerif && (
                            <button
                              type="button"
                              disabled={verifyingId === String(invoiceNo)}
                              onClick={() => handleVerifyManualOrder(t)}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold text-[11px] transition cursor-pointer shadow-xs inline-flex items-center gap-1"
                            >
                              {verifyingId === String(invoiceNo) ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Verifikasi...</span>
                                </>
                              ) : (
                                <span>Verifikasi Lunas</span>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                const invUrl = getStorefrontInvoiceUrl(tenantSlug, String(invoiceNo));
                                window.open(invUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="px-2.5 py-1 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg font-bold text-[11px] transition cursor-pointer"
                            title="Buka Lembar Invoice Resmi (shop.boontrack.com)"
                          >
                            Invoice
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INFO: REKENING BANK DI PENGATURAN TOKO */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
          <CreditCard className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black text-foreground">
            {activeBankAccounts.length > 0
              ? `${activeBankAccounts.length} Rekening Bank Aktif: ${activeBankAccounts.map(a => a.bank_name).join(', ')}`
              : 'Rekening Bank Belum Dikonfigurasi'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Kelola rekening di <strong>Pengaturan Toko → Tab 3. Payment / QRIS</strong>.
          </p>
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
                  Rp {Math.round(readyBalance).toLocaleString('id-ID')}
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

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="font-bold text-slate-800">Transfer Ditujukan ke:</div>
                {activeBankAccounts.length > 0 ? (
                  activeBankAccounts.map((acc, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900">{acc.bank_name}</span>
                        <span className="text-slate-500 font-mono ml-1">{acc.account_number}</span>
                      </div>
                      <span className="text-slate-500 font-bold uppercase text-[10px]">a.n {acc.account_holder}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-amber-700 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Rekening belum dikonfigurasi. Atur di Pengaturan → Payment.</span>
                  </div>
                )}
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
