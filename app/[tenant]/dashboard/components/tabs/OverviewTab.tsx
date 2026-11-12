'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  AlertCircle,
  Search,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  ArrowDownLeft,
} from 'lucide-react';
import { TransactionItem } from '@/lib/product-catalog';
import DateRangePicker, { DateRangeState, getDateRangeFromPreset } from '../DateRangePicker';
import {
  calculateFinancialMetrics,
  isValidPaidStatus,
  isPendingVerificationStatus,
  normalizeOrderStatus,
  formatWIBDateTime,
  extractOrderAmount,
} from '@/lib/finance-engine';
import { getStorefrontInvoiceUrl } from '@/lib/storefront-urls';
import { exportOrdersToMetaCsv, MetaCsvExportSummary } from '@/lib/utils/orderFulfillment';
import { MetaCsvExportSummaryModal } from '../MetaCsvExportSummaryModal';

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
  onOrderUpdated?: (order: TransactionItem) => void;
}

type FinanceStatusFilter = 'ALL' | 'PAID' | 'PENDING_VERIFICATION' | 'PENDING' | 'FAILED';

interface ActiveBankAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

interface RawBankAccount {
  is_active?: boolean;
  account_number?: string;
  account?: string;
  bank_name?: string;
  name?: string;
  account_holder?: string;
  holder?: string;
}

const FAILED_FINANCE_STATUSES = new Set([
  'EXPIRED',
  'FAILED',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'REJECTED',
]);

interface FinanceStatusMeta {
  bucket: Exclude<FinanceStatusFilter, 'ALL'>;
  label: string;
  dotClass: string;
  badgeClass: string;
}

function isFailedFinanceStatus(rawStatus?: string | null): boolean {
  return FAILED_FINANCE_STATUSES.has(normalizeOrderStatus(rawStatus));
}

function resolveFinanceStatusMeta(rawStatus?: string | null): FinanceStatusMeta {
  if (isValidPaidStatus(rawStatus)) {
    return {
      bucket: 'PAID',
      label: 'Berhasil',
      dotClass: 'bg-emerald-500',
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
    };
  }
  if (isPendingVerificationStatus(rawStatus)) {
    return {
      bucket: 'PENDING_VERIFICATION',
      label: 'Verifikasi',
      dotClass: 'bg-amber-500',
      badgeClass:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
    };
  }
  if (isFailedFinanceStatus(rawStatus)) {
    return {
      bucket: 'FAILED',
      label: 'Gagal',
      dotClass: 'bg-red-500',
      badgeClass:
        'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80',
    };
  }
  return {
    bucket: 'PENDING',
    label: 'Diproses',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
}

function resolveTransactionTimestampMs(entry: TransactionItem): number {
  const rawDate = entry.created_at || entry.date || (entry.updated_at as string | undefined);
  if (!rawDate) return Number.NaN;
  return new Date(rawDate).getTime();
}

function getEntryReference(entry: TransactionItem): string {
  return String(entry.invoice_no || entry.id || entry.order_id || '-');
}

function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
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
  const [statusFilter, setStatusFilter] = useState<FinanceStatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [activeBankAccounts, setActiveBankAccounts] = useState<ActiveBankAccount[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<TransactionItem | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // State untuk ringkasan ekspor Meta CSV (Audit & Validasi Ketat)
  const [metaExportSummary, setMetaExportSummary] = useState<MetaCsvExportSummary | null>(null);
  const [isExportSummaryModalOpen, setIsExportSummaryModalOpen] = useState(false);

  // Financial Metrics dynamically calculated from backend transactions via universal finance engine
  const financialMetrics = useMemo(() => {
    return calculateFinancialMetrics(Array.isArray(transactions) ? transactions : [], {
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
    });
  }, [transactions, dateRange.startDate, dateRange.endDate]);

  // Load active bank accounts from Supabase for withdraw modal & Treasury summary display
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
        const rawAccounts: RawBankAccount[] =
          Array.isArray(meta.bank_accounts) && meta.bank_accounts.length > 0
            ? (meta.bank_accounts as RawBankAccount[])
            : meta.bank_transfer || meta.bank_settings
            ? [((meta.bank_transfer || meta.bank_settings) as RawBankAccount)]
            : [];

        if (mounted && rawAccounts.length > 0) {
          const accounts: ActiveBankAccount[] = rawAccounts
            .filter((a) => Boolean(a) && a.is_active !== false && Boolean(a.account_number || a.account))
            .map((a) => ({
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
    return () => {
      mounted = false;
    };
  }, [tenantSlug]);

  // Close active modals on Escape key
  useEffect(() => {
    if (!selectedEntry && !isWithdrawModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selectedEntry) {
        setSelectedEntry(null);
        setVerifyError(null);
      } else if (isWithdrawModalOpen && !isWithdrawing) {
        setIsWithdrawModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEntry, isWithdrawModalOpen, isWithdrawing, setIsWithdrawModalOpen]);

  const effectiveOmzet =
    financialMetrics.totalRevenue > 0
      ? financialMetrics.totalRevenue
      : !dateRange.startDate && !dateRange.endDate && totalOmzet > 0
      ? totalOmzet
      : 0;

  // Date & search scoped entries (pure calculation, no render-time Date.now)
  const dateAndSearchScopedEntries = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    const startMs = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
    const endMs = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Number.POSITIVE_INFINITY;
    const query = searchQuery.trim().toLowerCase();

    return transactions.filter((entry) => {
      const createdMs = resolveTransactionTimestampMs(entry);
      const inDateRange =
        !dateRange.startDate && !dateRange.endDate
          ? true
          : !Number.isNaN(createdMs) && createdMs >= startMs && createdMs <= endMs;
      if (!inDateRange) return false;

      if (!query) return true;
      const refId = getEntryReference(entry).toLowerCase();
      const customerName = String(entry.customer_name || entry.customerName || '').toLowerCase();
      const customerPhone = String(entry.customer_phone || entry.customerPhone || '').toLowerCase();
      const productTitle = String(
        entry.product_title || entry.product_name || entry.productTitle || entry.items_summary || ''
      ).toLowerCase();
      const method = String(entry.payment_method || entry.paymentMethod || '').toLowerCase();

      return (
        refId.includes(query) ||
        customerName.includes(query) ||
        customerPhone.includes(query) ||
        productTitle.includes(query) ||
        method.includes(query)
      );
    });
  }, [transactions, dateRange.startDate, dateRange.endDate, searchQuery]);

  // Count per status bucket within date/search scope
  const ledgerCounts = useMemo(() => {
    const counts = {
      ALL: dateAndSearchScopedEntries.length,
      PAID: 0,
      PENDING_VERIFICATION: 0,
      PENDING: 0,
      FAILED: 0,
    };
    for (const entry of dateAndSearchScopedEntries) {
      const meta = resolveFinanceStatusMeta(entry.status || entry.payment_status);
      counts[meta.bucket] += 1;
    }
    return counts;
  }, [dateAndSearchScopedEntries]);

  const filteredTransactions = useMemo(() => {
    if (statusFilter === 'ALL') return dateAndSearchScopedEntries;
    return dateAndSearchScopedEntries.filter((entry) => {
      const meta = resolveFinanceStatusMeta(entry.status || entry.payment_status);
      return meta.bucket === statusFilter;
    });
  }, [dateAndSearchScopedEntries, statusFilter]);

  const heldBalanceTotal =
    financialMetrics.pendingVerificationAmount + financialMetrics.pendingPaymentAmount;

  const handleCopyReference = useCallback((refText: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!refText || refText === '-') return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(refText).catch(() => null);
    }
    setCopiedRef(refText);
    setTimeout(() => {
      setCopiedRef((prev) => (prev === refText ? null : prev));
    }, 1800);
  }, []);

  const openEntryDetail = useCallback((entry: TransactionItem) => {
    setVerifyError(null);
    setSelectedEntry(entry);
  }, []);

  // Action: Tandai Lunas order manual yang berstatus ORDER_PENDING_VERIFICATION (hanya setelah persetujuan backend)
  const handleVerifyManualOrder = async (order: TransactionItem) => {
    const orderId = order.id || order.order_id || order.invoice_no;
    if (!orderId || !tenantSlug) return;

    setVerifyingId(String(orderId));
    setVerifyError(null);
    try {
      const res = await fetch(
        `/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${encodeURIComponent(String(orderId))}/quick-paid`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || 'Gagal memverifikasi pembayaran di server.');
      }

      const payload = await res.json().catch(() => ({ success: true }));
      if (payload?.success === false) {
        throw new Error(payload?.error || 'Verifikasi ditolak oleh server.');
      }

      const updatedOrder: TransactionItem = {
        ...order,
        status: 'PAID',
        payment_status: 'PAID',
        verified_at: new Date().toISOString(),
      };

      if (onOrderUpdated) {
        onOrderUpdated(updatedOrder);
      }
      setSelectedEntry((prev) =>
        prev && getEntryReference(prev) === getEntryReference(order) ? updatedOrder : prev
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi server untuk verifikasi.';
      setVerifyError(msg);
      console.warn('Verifikasi order manual note:', err);
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="flex-1 px-4 py-5 md:px-6 md:py-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-5">
      {/* HEADER TREASURY / PAYOUTS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 relative z-20 overflow-visible">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Wallet className="w-4 h-4" />
              </span>
              <span>Payouts &amp; Keuangan</span>
            </h2>
            {displayName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {displayName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ringkasan saldo siap tarik, log mutasi transaksi masuk (WIB), dan verifikasi settlement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto relative z-30 overflow-visible">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <button
            type="button"
            id="overview-export-meta-csv-btn"
            onClick={() => {
              const summary = exportOrdersToMetaCsv(filteredTransactions, tenantSlug || 'default');
              setMetaExportSummary(summary);
              setIsExportSummaryModalOpen(true);
            }}
            className="px-3 py-2 bg-white dark:bg-[#0D1117] hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsWithdrawModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition active:scale-[0.98] cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Tarik Saldo Toko</span>
          </button>
        </div>
      </div>

      {/* KPI TREASURY CARDS: 4 COMPACT DODO/STRIPE TREASURY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. SALDO DAPAT DITARIK (VERBATIM DARI BACKEND) */}
        <div className="bg-white dark:bg-[#0D1117] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Saldo Dapat Ditarik
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Siap Cair
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
            {formatRupiah(readyBalance)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Saldo bersih realtime dari backend
          </p>
        </div>

        {/* 2. TOTAL OMZET MASUK */}
        <div className="bg-white dark:bg-[#0D1117] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              Total Omzet {dateRange.preset !== 'all' ? `(${dateRange.label})` : 'Masuk'}
            </span>
            <span className="p-1.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-800/70 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
            {formatRupiah(effectiveOmzet)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {financialMetrics.totalSuccessfulOrders}
            </span>{' '}
            lunas · AOV{' '}
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              {formatRupiah(financialMetrics.aov)}
            </span>
          </p>
        </div>

        {/* 3. SALDO TERTAHAN / MENUNGGU VERIFIKASI */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(
              statusFilter === 'PENDING_VERIFICATION' ? 'ALL' : 'PENDING_VERIFICATION'
            )
          }
          className={`text-left rounded-xl p-4 border transition-colors cursor-pointer space-y-2 ${
            statusFilter === 'PENDING_VERIFICATION'
              ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-300 dark:border-amber-700 ring-1 ring-amber-400/40'
              : 'bg-white dark:bg-[#0D1117] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Saldo Tertahan &amp; Pending
            </span>
            <span className="p-1.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-800/70 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
            {formatRupiah(heldBalanceTotal)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Verifikasi:{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              {financialMetrics.pendingVerificationCount}
            </span>{' '}
            · Pending:{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {financialMetrics.pendingPaymentCount}
            </span>
          </p>
        </button>

        {/* 4. REKENING TUJUAN SETTLEMENT */}
        <div className="bg-white dark:bg-[#0D1117] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Rekening Tujuan Settlement
            </span>
            <span className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg">
              <CreditCard className="w-3.5 h-3.5" />
            </span>
          </div>
          {activeBankAccounts.length > 0 ? (
            <>
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {activeBankAccounts[0].bank_name}{' '}
                <span className="font-mono tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {activeBankAccounts[0].account_number}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                a.n. {activeBankAccounts[0].account_holder || '-'}
                {activeBankAccounts.length > 1
                  ? ` (+${activeBankAccounts.length - 1} rekening)`
                  : ''}
              </p>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Belum Terkonfigurasi
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Atur di Pengaturan → Payment
              </p>
            </>
          )}
        </div>
      </div>

      {/* DENSE PAYOUT / MUTASI LEDGER CARD */}
      <div className="bg-white dark:bg-[#0D1117] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* TOOLBAR PENCARIAN & FILTER STATUS */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h3
                id="finance-ledger-heading"
                className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider"
              >
                Riwayat Mutasi Saldo &amp; Transaksi
              </h3>
              <span className="px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {filteredTransactions.length}
              </span>
            </div>

            {/* Search ID Referensi / Pelanggan Instan */}
            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ID referensi, invoice, pelanggan..."
                aria-label="Cari ID referensi atau transaksi"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Segmented Status Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg items-center text-[11px] font-medium gap-0.5">
              {(
                [
                  { id: 'ALL', label: 'Semua', count: ledgerCounts.ALL },
                  { id: 'PAID', label: 'Berhasil', count: ledgerCounts.PAID },
                  {
                    id: 'PENDING_VERIFICATION',
                    label: 'Verifikasi',
                    count: ledgerCounts.PENDING_VERIFICATION,
                  },
                  { id: 'PENDING', label: 'Diproses', count: ledgerCounts.PENDING },
                  { id: 'FAILED', label: 'Gagal', count: ledgerCounts.FAILED },
                ] as { id: FinanceStatusFilter; label: string; count: number }[]
              ).map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="font-mono tabular-nums text-[10px] opacity-75">
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {verifyError && (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-2.5 py-1 rounded-lg">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}
          </div>
        </div>

        {/* DESKTOP DENSE TRANSACTION & PAYOUT MUTATION TABLE */}
        <div
          className="hidden md:block overflow-x-auto focus:outline-none"
          tabIndex={0}
          role="region"
          aria-labelledby="finance-ledger-heading"
        >
          <table className="w-full min-w-[780px] text-left border-collapse text-xs text-slate-700 dark:text-slate-200">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-2.5 px-3">Referensi / Invoice</th>
                <th className="py-2.5 px-3">Waktu (WIB)</th>
                <th className="py-2.5 px-3">Uraian &amp; Pelanggan</th>
                <th className="py-2.5 px-3">Metode</th>
                <th className="py-2.5 px-3 text-right">Nominal</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Tidak ada mutasi atau transaksi pada filter ini.
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {searchQuery || statusFilter !== 'ALL'
                          ? 'Coba ubah kata kunci referensi, status, atau rentang tanggal.'
                          : 'Transaksi masuk & settlement etalase akan tampil otomatis di sini.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((entry) => {
                  const refNo = getEntryReference(entry);
                  const dateVal =
                    entry.created_at || entry.date || (entry.updated_at as string | undefined);
                  const customerName =
                    entry.customer_name || entry.customerName || 'Pelanggan Toko';
                  const customerPhone = entry.customer_phone || entry.customerPhone;
                  const productTitle =
                    entry.product_title ||
                    entry.product_name ||
                    entry.productTitle ||
                    entry.items_summary ||
                    'Mutasi Penjualan';
                  const grossAmount = extractOrderAmount(entry);
                  const rawStatus = entry.status || entry.payment_status || 'PENDING';
                  const statusMeta = resolveFinanceStatusMeta(rawStatus);
                  const paymentMethod =
                    entry.payment_method || entry.paymentMethod || 'QRIS Dinamis';
                  const orderId = String(entry.id || entry.order_id || refNo);

                  return (
                    <tr
                      key={orderId}
                      onClick={() => openEntryDetail(entry)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800/70 shrink-0">
                            <ArrowDownLeft className="w-3 h-3" />
                          </span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                            {refNo}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyReference(refNo, e)}
                            title="Salin ID Referensi"
                            aria-label={`Salin referensi ${refNo}`}
                            className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            {copiedRef === refNo ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0 opacity-70" />
                          {formatWIBDateTime(dateVal)}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle max-w-[260px]">
                        <div
                          className="font-medium text-slate-900 dark:text-white truncate"
                          title={productTitle}
                        >
                          {productTitle}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {customerName}
                          {customerPhone
                            ? ` · ${
                                String(customerPhone).startsWith('+')
                                  ? customerPhone
                                  : `+${customerPhone}`
                              }`
                            : ''}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded font-mono">
                          {paymentMethod}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {statusMeta.bucket === 'PAID' ? '+ ' : ''}
                        {formatRupiah(grossAmount)}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                          {statusMeta.label}
                        </span>
                      </td>

                      <td
                        className="py-2.5 px-3 align-middle text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {statusMeta.bucket === 'PENDING_VERIFICATION' && (
                            <button
                              type="button"
                              disabled={verifyingId === orderId}
                              onClick={() => handleVerifyManualOrder(entry)}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md font-semibold text-[11px] transition cursor-pointer inline-flex items-center gap-1"
                            >
                              {verifyingId === orderId ? (
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
                            onClick={() => openEntryDetail(entry)}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md font-medium text-[11px] transition-colors cursor-pointer"
                          >
                            Rincian
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                const invUrl = getStorefrontInvoiceUrl(tenantSlug, refNo);
                                window.open(invUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="p-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-md transition-colors cursor-pointer"
                            title="Buka Lembar Invoice Resmi"
                            aria-label={`Buka invoice ${refNo}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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

        {/* MOBILE COMPACT MUTATION LIST */}
        <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
          {filteredTransactions.length === 0 ? (
            <div className="px-4 py-10 text-center space-y-1.5">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Tidak ada mutasi pada filter ini.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ubah kata kunci pencarian atau rentang tanggal.
              </p>
            </div>
          ) : (
            filteredTransactions.map((entry) => {
              const refNo = getEntryReference(entry);
              const dateVal =
                entry.created_at || entry.date || (entry.updated_at as string | undefined);
              const customerName = entry.customer_name || entry.customerName || 'Pelanggan Toko';
              const productTitle =
                entry.product_title ||
                entry.product_name ||
                entry.productTitle ||
                entry.items_summary ||
                'Mutasi Penjualan';
              const grossAmount = extractOrderAmount(entry);
              const statusMeta = resolveFinanceStatusMeta(entry.status || entry.payment_status);
              const orderId = String(entry.id || entry.order_id || refNo);

              return (
                <div
                  key={orderId}
                  onClick={() => openEntryDetail(entry)}
                  className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums truncate">
                        {refNo}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {formatWIBDateTime(dateVal)}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${statusMeta.badgeClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {productTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {customerName}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white shrink-0">
                      {statusMeta.bucket === 'PAID' ? '+ ' : ''}
                      {formatRupiah(grossAmount)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL / DRAWER RINCIAN MUTASI & TRANSAKSI (ADAPTIF LIGHT/DARK MODE) */}
      {selectedEntry && (() => {
        const refNo = getEntryReference(selectedEntry);
        const dateVal =
          selectedEntry.created_at ||
          selectedEntry.date ||
          (selectedEntry.updated_at as string | undefined);
        const customerName =
          selectedEntry.customer_name || selectedEntry.customerName || 'Pelanggan Toko';
        const customerPhone = selectedEntry.customer_phone || selectedEntry.customerPhone;
        const productTitle =
          selectedEntry.product_title ||
          selectedEntry.product_name ||
          selectedEntry.productTitle ||
          selectedEntry.items_summary ||
          'Mutasi Penjualan';
        const grossAmount = extractOrderAmount(selectedEntry);
        const rawStatus = selectedEntry.status || selectedEntry.payment_status || 'PENDING';
        const statusMeta = resolveFinanceStatusMeta(rawStatus);
        const paymentMethod =
          selectedEntry.payment_method || selectedEntry.paymentMethod || 'QRIS Dinamis';
        const orderId = String(selectedEntry.id || selectedEntry.order_id || refNo);

        return (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              setSelectedEntry(null);
              setVerifyError(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="finance-detail-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0D1117] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-3">
                <div>
                  <h3
                    id="finance-detail-modal-title"
                    className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"
                  >
                    <span>Rincian Mutasi &amp; Transaksi</span>
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {refNo}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyReference(refNo, e)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      aria-label="Salin ID Referensi"
                    >
                      {copiedRef === refNo ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntry(null);
                    setVerifyError(null);
                  }}
                  aria-label="Tutup rincian"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Nominal Mutasi
                    </div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {statusMeta.bucket === 'PAID' ? '+ ' : ''}
                      {formatRupiah(grossAmount)}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusMeta.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                    {statusMeta.label}
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Waktu (WIB)</dt>
                    <dd className="font-medium text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {formatWIBDateTime(dateVal)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Metode Bayar</dt>
                    <dd className="font-mono font-medium text-slate-900 dark:text-white mt-0.5">
                      {paymentMethod}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Pelanggan</dt>
                    <dd className="font-medium text-slate-900 dark:text-white mt-0.5">
                      {customerName}
                      {customerPhone
                        ? ` (${
                            String(customerPhone).startsWith('+')
                              ? customerPhone
                              : `+${customerPhone}`
                          })`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Produk / Uraian</dt>
                    <dd className="font-medium text-slate-900 dark:text-white mt-0.5">
                      {productTitle}
                    </dd>
                  </div>
                </dl>

                {verifyError && (
                  <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/70 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{verifyError}</span>
                  </div>
                )}
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-end gap-2">
                {statusMeta.bucket === 'PENDING_VERIFICATION' && (
                  <button
                    type="button"
                    disabled={verifyingId === orderId}
                    onClick={() => handleVerifyManualOrder(selectedEntry)}
                    className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {verifyingId === orderId ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Memverifikasi...</span>
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
                      const invUrl = getStorefrontInvoiceUrl(tenantSlug, refNo);
                      window.open(invUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Invoice Resmi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntry(null);
                    setVerifyError(null);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 font-semibold text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL TARIK SALDO (HARMONIZED SIKLUS 2C LIGHT/DARK) */}
      {isWithdrawModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            if (!isWithdrawing) setIsWithdrawModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#0D1117] text-slate-900 dark:text-white rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
              <h3
                id="withdraw-modal-title"
                className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Tarik Saldo Penjualan ke Rekening</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsWithdrawModalOpen(false)}
                aria-label="Tutup modal tarik saldo"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProcessWithdraw} className="p-5 space-y-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                  Saldo Dapat Ditarik
                </span>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {formatRupiah(readyBalance)}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Nominal Penarikan (Rp)
                </label>
                <input
                  type="number"
                  required
                  min={50000}
                  max={readyBalance}
                  value={withdrawAmount || ''}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  placeholder="Min. 50.000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block tabular-nums">
                  Minimal penarikan dana Rp 50.000
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/70 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Transfer Ditujukan ke:
                </div>
                {activeBankAccounts.length > 0 ? (
                  activeBankAccounts.map((acc, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {acc.bank_name}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 font-mono tabular-nums ml-1.5">
                          {acc.account_number}
                        </span>
                      </div>
                      <span className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">
                        a.n {acc.account_holder}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Rekening belum dikonfigurasi. Atur di Pengaturan → Payment.</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={readyBalance < 50000 || isWithdrawing}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
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

      {/* META CSV EXPORT SUMMARY MODAL (SKIP SUMMARY & AUDIT) */}
      <MetaCsvExportSummaryModal
        isOpen={isExportSummaryModalOpen}
        onClose={() => setIsExportSummaryModalOpen(false)}
        summary={metaExportSummary}
      />
    </div>
  );
}
