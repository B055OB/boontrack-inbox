'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Receipt,
  MessageSquare,
  Eye,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
  Circle,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  Radio,
  Package,
  QrCode,
  Clock,
} from 'lucide-react';
import type { ProductItem, TransactionItem } from '@/lib/product-catalog';
import type { DashboardTab } from '@/app/[tenant]/dashboard/hooks/useTenantDashboard';
import {
  calculateFinancialMetrics,
  isValidPaidStatus,
  isPendingVerificationStatus,
  extractOrderAmount,
  formatWIBDateString,
  formatWIBDateTime,
  normalizeOrderStatus,
} from '@/lib/finance-engine';
import { formatCurrency } from '@/lib/i18n';
import { getStorefrontInvoiceUrl } from '@/lib/storefront-urls';
import { useLocalStorageValue } from './DashboardShell';

export type OverviewPeriod = '1d' | '7d' | '30d';

export type OverviewTransactionRecord = TransactionItem & {
  order_id?: string;
  order_number?: string;
  final_amount?: number | string;
  total_price?: number | string;
  updated_at?: string;
};

export interface DashboardOverviewTabProps {
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeBio?: string;
  storeLogoUrl?: string;
  storeQrisUrl?: string;
  waStatus: string;
  connectedPhone?: string | null;
  products: ProductItem[];
  transactions: OverviewTransactionRecord[];
  totalOmzet: number;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isSoloOrTrial?: boolean;
  isCheckoutLite?: boolean;
  isTrialActive?: boolean;
  tierLabel?: string;
  trialDaysLeft?: number | null;
  storeCategory?: string;
  chatConversationsCount?: number;
  onOpenStoreSettings: () => void;
  onOpenNewProduct: () => void;
  onApplyPitch?: (patch: Partial<ProductItem>) => void;
  onNavigateTab: (tab: DashboardTab) => void;
  onSavedFeedback?: (msg: string) => void;
  customDomain?: string | null;
}

interface AnalyticsSummaryState {
  period: OverviewPeriod;
  visits: number;
  chatSessions: number;
  ordersCount: number;
  totalOmzet: number;
}

const PERIOD_OPTIONS: Array<{ id: OverviewPeriod; label: string; caption: string }> = [
  { id: '1d', label: 'Hari Ini', caption: 'Hari ini (WIB)' },
  { id: '7d', label: '7 Hari', caption: '7 hari terakhir' },
  { id: '30d', label: '30 Hari', caption: '30 hari terakhir' },
];

function buildPeriodStartIso(period: OverviewPeriod): string {
  if (period === '1d') {
    return `${formatWIBDateString(new Date())}T00:00:00+07:00`;
  }
  const days = period === '30d' ? 30 : 7;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function getOrderTimestampMs(tx: OverviewTransactionRecord): number {
  const raw = tx.created_at || tx.date || tx.updated_at;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getOrderStatusStyle(rawStatus?: string | null): { label: string; className: string } {
  const normalized = normalizeOrderStatus(rawStatus);
  if (isValidPaidStatus(normalized)) {
    return {
      label: 'PAID',
      className:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/70',
    };
  }
  if (isPendingVerificationStatus(normalized)) {
    return {
      label: 'VERIFIKASI',
      className:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/70',
    };
  }
  if (normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'EXPIRED') {
    return {
      label: normalized,
      className:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/70',
    };
  }
  return {
    label: 'PENDING',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
}

/**
 * Dodo-style operational overview tab displaying period KPIs, a compact
 * collapsible onboarding progress strip, and a dense recent-transactions table.
 */
export default function DashboardOverviewTab({
  tenantSlug,
  displayName,
  storeDisplayName,
  storeQrisUrl,
  waStatus,
  connectedPhone,
  products = [],
  transactions = [],
  chatConversationsCount,
  onOpenStoreSettings,
  onOpenNewProduct,
  onNavigateTab,
  onSavedFeedback,
  customDomain,
}: DashboardOverviewTabProps) {
  const normalizedSlug = (tenantSlug || 'default').toLowerCase().trim();
  const activeStoreName = storeDisplayName || displayName || tenantSlug;
  const cleanCustomDomain = (customDomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const cleanSlug = encodeURIComponent(normalizedSlug.replace(/^\/+|\/+$/g, ''));
  const storePublicUrl = cleanCustomDomain
    ? `https://${cleanCustomDomain}`
    : cleanSlug
      ? `https://boontrack.com/${cleanSlug}`
      : 'https://boontrack.com';

  const [periodState, setPeriodState] = useState<{ period: OverviewPeriod; startIso: string }>(() => ({
    period: '7d',
    startIso: buildPeriodStartIso('7d'),
  }));
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummaryState | null>(null);
  const [hasCopiedUrl, setHasCopiedUrl] = useState(false);

  const [isChecklistDismissedRaw, setIsChecklistDismissedRaw] = useLocalStorageValue(
    `bt_overview_checklist_dismissed:${normalizedSlug}`,
    'false'
  );
  const isChecklistDismissed = isChecklistDismissedRaw === 'true';
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false);

  const handleSelectPeriod = useCallback((nextPeriod: OverviewPeriod) => {
    setPeriodState({
      period: nextPeriod,
      startIso: buildPeriodStartIso(nextPeriod),
    });
  }, []);

  useEffect(() => {
    if (!tenantSlug) return;
    const controller = new AbortController();
    const requestedPeriod = periodState.period;
    const requestedStartIso = periodState.startIso;

    async function loadAnalyticsSummary() {
      try {
        const res = await fetch(
          `/api/v1/tenants/${encodeURIComponent(tenantSlug)}/analytics/summary?start_date=${encodeURIComponent(requestedStartIso)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          success?: boolean;
          visits?: number;
          chat_sessions?: number;
          orders_count?: number;
          total_omzet?: number;
        };
        if (json.success && !controller.signal.aborted) {
          setAnalyticsSummary({
            period: requestedPeriod,
            visits: typeof json.visits === 'number' ? json.visits : 0,
            chatSessions: typeof json.chat_sessions === 'number' ? json.chat_sessions : 0,
            ordersCount: typeof json.orders_count === 'number' ? json.orders_count : 0,
            totalOmzet: typeof json.total_omzet === 'number' ? json.total_omzet : 0,
          });
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          console.warn('Gagal memuat ringkasan analitik:', err);
        }
      }
    }

    loadAnalyticsSummary();
    return () => controller.abort();
  }, [tenantSlug, periodState.period, periodState.startIso]);

  const handleCopyStoreLink = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(storePublicUrl);
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = storePublicUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setHasCopiedUrl(true);
      onSavedFeedback?.('Tautan toko berhasil disalin!');
      setTimeout(() => setHasCopiedUrl(false), 2000);
    } catch (err) {
      console.warn('Gagal menyalin tautan toko:', err);
    }
  }, [storePublicUrl, onSavedFeedback]);

  const handleOpenBoonPilotGuide = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('open-boonpilot', {
        detail: {
          prompt:
            'Halo BoonPilot, bantu saya menyelesaikan checklist setup toko agar siap menerima pesanan otomatis.',
        },
      })
    );
  }, []);

  const periodMeta = useMemo(
    () => PERIOD_OPTIONS.find((opt) => opt.id === periodState.period) || PERIOD_OPTIONS[1],
    [periodState.period]
  );

  const periodMetrics = useMemo(
    () =>
      calculateFinancialMetrics(Array.isArray(transactions) ? transactions : [], {
        startDate: periodState.startIso,
      }),
    [transactions, periodState.startIso]
  );

  const isSyncingAnalytics = Boolean(tenantSlug) && analyticsSummary?.period !== periodState.period;
  const hasSummaryForPeriod = analyticsSummary?.period === periodState.period;

  const displayOmzet =
    transactions.length > 0
      ? periodMetrics.totalRevenue
      : hasSummaryForPeriod
      ? analyticsSummary.totalOmzet
      : 0;

  const displayOrdersCount =
    transactions.length > 0
      ? periodMetrics.totalOrdersCount
      : hasSummaryForPeriod
      ? analyticsSummary.ordersCount
      : 0;

  const displayChatsCount = analyticsSummary
    ? analyticsSummary.chatSessions
    : chatConversationsCount ?? 0;

  const displayVisitsCount = analyticsSummary ? analyticsSummary.visits : 0;

  const pendingOrdersCount =
    periodMetrics.pendingPaymentCount + periodMetrics.pendingVerificationCount;

  const isPlatformPhone = Boolean(
    connectedPhone &&
      (connectedPhone.includes('85181830080') ||
        connectedPhone.includes('85179555449') ||
        connectedPhone.includes('85139555449'))
  );
  const isWaConnected = (waStatus === 'CONNECTED' || Boolean(connectedPhone)) && !isPlatformPhone;
  const isProductAdded = products.length > 0;
  const isQrisReady = Boolean(storeQrisUrl && storeQrisUrl.trim() !== '');

  const onboardingSteps = useMemo(
    () => [
      {
        id: 'step-catalog',
        title: 'Setup Toko & Produk',
        description: isProductAdded
          ? `${products.length} produk aktif di katalog etalase`
          : 'Tambahkan produk atau paket pertama agar etalase siap dijual',
        done: isProductAdded,
        primaryLabel: isProductAdded ? 'Kelola Produk' : '+ Tambah Produk',
        onPrimaryClick: isProductAdded ? () => onNavigateTab('catalog') : onOpenNewProduct,
        secondaryLabel: 'Profil Toko',
        onSecondaryClick: onOpenStoreSettings,
        icon: Package,
      },
      {
        id: 'step-qris',
        title: 'Pembayaran QRIS & Identitas',
        description: isQrisReady
          ? 'QRIS checkout & identitas toko sudah terpasang'
          : 'Unggah QRIS toko agar verifikasi pembayaran berjalan otomatis',
        done: isQrisReady,
        primaryLabel: isQrisReady ? 'Edit QRIS' : 'Atur QRIS',
        onPrimaryClick: onOpenStoreSettings,
        icon: QrCode,
      },
      {
        id: 'step-wa-boonpilot',
        title: 'Terhubung ke BoonPilot & WhatsApp',
        description: isWaConnected
          ? 'Bot WhatsApp aktif melayani pembeli & asisten BoonPilot siap'
          : 'Tautkan nomor WhatsApp toko atau buka panduan cepat BoonPilot',
        done: isWaConnected,
        primaryLabel: isWaConnected ? 'Kelola Bot WA' : 'Konek WhatsApp',
        onPrimaryClick: () => onNavigateTab('whatsapp'),
        secondaryLabel: 'Tanya BoonPilot',
        onSecondaryClick: handleOpenBoonPilotGuide,
        icon: Radio,
      },
    ],
    [
      isProductAdded,
      isQrisReady,
      isWaConnected,
      products.length,
      onNavigateTab,
      onOpenNewProduct,
      onOpenStoreSettings,
      handleOpenBoonPilotGuide,
    ]
  );

  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const progressPercent = Math.round((completedSteps / onboardingSteps.length) * 100);

  const sortedTransactions = useMemo(() => {
    if (!Array.isArray(transactions) || transactions.length === 0) return [];
    return [...transactions].sort((a, b) => getOrderTimestampMs(b) - getOrderTimestampMs(a));
  }, [transactions]);

  const recentTransactions = useMemo(() => sortedTransactions.slice(0, 8), [sortedTransactions]);

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-150">
      {/* ROW 1: HEADER RINGKAS + FILTER PERIODE WAKTU */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Ringkasan Operasional
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate font-medium text-slate-700 dark:text-slate-300">
              {activeStoreName}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              •
            </span>
            <Link
              href={storePublicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              <span className="truncate max-w-[220px]">
                {storePublicUrl.replace(/^https?:\/\//i, '')}
              </span>
              <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
            </Link>
            <button
              type="button"
              onClick={handleCopyStoreLink}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Salin tautan etalase toko"
            >
              {hasCopiedUrl ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Salin</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div
          role="group"
          aria-label="Filter Periode Waktu"
          className="inline-flex items-center self-start sm:self-auto p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0"
        >
          {PERIOD_OPTIONS.map((option) => {
            const isSelected = periodState.period === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectPeriod(option.id)}
                aria-pressed={isSelected}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ROW 2: KPI METRIC CARDS GRID (4 KOLOM) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Omzet Masuk (Rp) */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Omzet Masuk (Rp)
            </span>
            <Wallet className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {formatCurrency(displayOmzet)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {periodMetrics.totalSuccessfulOrders > 0
              ? `${periodMetrics.totalSuccessfulOrders.toLocaleString('id-ID')} lunas${
                  periodMetrics.aov > 0 ? ` · AOV ${formatCurrency(periodMetrics.aov)}` : ''
                }`
              : `Periode ${periodMeta.caption}`}
          </p>
        </div>

        {/* Card 2: Pesanan / Invoice QRIS */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Pesanan / Invoice QRIS
            </span>
            <Receipt className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {displayOrdersCount.toLocaleString('id-ID')}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {pendingOrdersCount > 0
              ? `${pendingOrdersCount.toLocaleString('id-ID')} menunggu konfirmasi`
              : periodOrdersLabel(displayOrdersCount, periodMeta.caption)}
          </p>
        </div>

        {/* Card 3: Chat Interaksi WA */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Chat Interaksi WA
            </span>
            <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {displayChatsCount.toLocaleString('id-ID')}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isWaConnected ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
            <span className="truncate">
              {isWaConnected ? 'WhatsApp terhubung' : 'WhatsApp belum aktif'}
            </span>
          </p>
        </div>

        {/* Card 4: Pengunjung Toko */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Pengunjung Toko
            </span>
            <Eye className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {displayVisitsCount.toLocaleString('id-ID')}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isSyncingAnalytics
              ? `Menyinkronkan (${periodMeta.caption})...`
              : `Kunjungan ${periodMeta.caption}`}
          </p>
        </div>
      </div>

      {/* ROW 3: CHECKLIST ONBOARDING RAMPING (COLLAPSIBLE / DISMISSABLE) */}
      {!isChecklistDismissed && (
        <section
          aria-label="Checklist Persiapan Toko"
          className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 rounded-xl overflow-hidden"
        >
          <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {completedSteps === onboardingSteps.length ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
              )}
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Setup Toko
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 tabular-nums">
                {completedSteps}/{onboardingSteps.length} Langkah Selesai
              </span>
            </div>

            <div className="flex-1 min-w-[120px] max-w-xs hidden md:block">
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsChecklistExpanded((prev) => !prev)}
                aria-expanded={isChecklistExpanded}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                <span>{isChecklistExpanded ? 'Tutup Detail' : 'Selesaikan'}</span>
                {isChecklistExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsChecklistDismissedRaw('true')}
                aria-label="Tutup checklist onboarding"
                title="Sembunyikan checklist onboarding"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {isChecklistExpanded && (
            <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80">
              {onboardingSteps.map((step) => {
                const StepIcon = step.icon;
                return (
                  <div
                    key={step.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 sm:mt-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5 sm:mt-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StepIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline-block" />
                          <p
                            className={`text-xs font-semibold ${
                              step.done
                                ? 'text-slate-500 dark:text-slate-400 line-through decoration-slate-300 dark:decoration-slate-600'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {step.title}
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                      {step.secondaryLabel && step.onSecondaryClick && (
                        <button
                          type="button"
                          onClick={step.onSecondaryClick}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          {step.secondaryLabel}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={step.onPrimaryClick}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        {step.primaryLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ROW 4: DENSE TABLE AKTIVITAS / PESANAN TERBARU */}
      <section
        aria-label="Aktivitas dan Pesanan Terbaru"
        className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 rounded-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              Aktivitas / Pesanan Terbaru
            </h2>
            {sortedTransactions.length > 0 && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                {recentTransactions.length} dari {sortedTransactions.length}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('orders')}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            <span>Lihat Semua</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Pelanggan</th>
                <th className="px-4 py-2.5">Produk</th>
                <th className="px-4 py-2.5">Metode</th>
                <th className="px-4 py-2.5 text-right">Nominal</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        Belum ada aktivitas transaksi tercatat
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Pesanan dari etalase atau WhatsApp AI akan langsung muncul dalam tabel ini.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                recentTransactions.map((tx, idx) => {
                  const invoiceNo = String(tx.order_number || tx.invoice_no || tx.order_id || tx.id || `#${idx + 1}`);
                  const customerName = tx.customer_name || tx.customerName || 'Pelanggan';
                  const productTitle =
                    tx.items_summary || tx.product_name || tx.product_title || tx.productTitle || 'Pesanan Produk';
                  const paymentMethod = tx.payment_method || tx.paymentMethod || 'QRIS';
                  const amount = extractOrderAmount(tx);
                  const statusStyle = getOrderStatusStyle(tx.status || tx.payment_status);
                  const dateVal = tx.created_at || tx.date || tx.updated_at;
                  const invoiceUrl = getStorefrontInvoiceUrl(tenantSlug, invoiceNo);

                  return (
                    <tr
                      key={String(tx.id || invoiceNo || idx)}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <Link
                          href={invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                          title="Buka halaman invoice"
                        >
                          <span>{invoiceNo}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 max-w-[150px] truncate">
                        {customerName}
                      </td>
                      <td
                        className="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-[210px] truncate"
                        title={productTitle}
                      >
                        {productTitle}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                          {paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatCurrency(amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusStyle.className}`}
                        >
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3 opacity-70" />
                          <span>{dateVal ? formatWIBDateTime(dateVal) : '-'}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function periodOrdersLabel(count: number, caption: string): string {
  if (count > 0) return `${count.toLocaleString('id-ID')} pesanan (${caption})`;
  return `Menunggu pesanan (${caption})`;
}
