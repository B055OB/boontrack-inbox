'use client';

/**
 * @file TrialQuotaProgressBar.tsx
 * @description Dashboard widget: visual trial usage progress bar & hard-cap monitor.
 *
 * Displays trial resource consumption:
 *   - Orders: X / 30 (Maksimal 30 Order)
 *   - AI Interactions: Y / 50 (Maksimal 50 Interaksi AI)
 *   - WA Notifications: Z / 15 (Maksimal 15 Notifikasi WA)
 *
 * Only rendered when isTrial = true. Non-trial tenants see nothing.
 * Shows prominent warning badge and upgrade CTA when approaching (>=80%) or exceeding limits.
 *
 * @architecture BATCH 1 / Ticket 1.2
 */

import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react';

interface QuotaResource {
  current: number;
  limit: number;
  exceeded: boolean;
  percent: number;
  label: string;
}

interface TrialQuotaData {
  is_trial: boolean;
  trial_ends_at: string | null;
  quota: {
    orders: QuotaResource;
    interactions: QuotaResource;
    wa_notifications?: QuotaResource;
  };
}

interface Props {
  tenantSlug: string;
  /** Optional callback when upgrade button is clicked. */
  onUpgradeClick?: () => void;
}

export default function TrialQuotaProgressBar({ tenantSlug, onUpgradeClick }: Props) {
  const [data, setData] = useState<TrialQuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug) return;

    fetch(`/api/v1/trial/quota?slug=${encodeURIComponent(tenantSlug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json);
      })
      .catch((err) => console.warn('[TrialQuotaProgressBar] Fetch failed:', err))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  // Don't render for non-trial tenants or while loading
  if (loading || !data || !data.is_trial) return null;

  const { quota, trial_ends_at } = data;

  // Ensure 15 WA limit fallback if not present in payload
  const waQuota: QuotaResource = quota.wa_notifications ?? {
    current: Math.min(quota.orders.current, 15),
    limit: 15,
    exceeded: quota.orders.current >= 15,
    percent: Math.min(100, Math.round((Math.min(quota.orders.current, 15) / 15) * 100)),
    label: `Notifikasi WA: ${Math.min(quota.orders.current, 15)}/15`,
  };

  const daysLeft = trial_ends_at
    ? Math.max(0, Math.ceil((new Date(trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const anyExceeded = quota.orders.exceeded || quota.interactions.exceeded || waQuota.exceeded;
  const anyWarning = quota.orders.percent >= 80 || quota.interactions.percent >= 80 || waQuota.percent >= 80;

  const barColor = (percent: number, exceeded: boolean): string => {
    if (exceeded) return '#ef4444'; // red-500
    if (percent >= 80) return '#f59e0b'; // amber-500
    return '#3b82f6'; // blue-500
  };

  return (
    <div
      role="region"
      aria-label="Pemakaian Kuota Trial"
      className={`w-full max-w-full overflow-hidden rounded-2xl p-4 sm:p-5 border shadow-xs transition-all ${
        anyExceeded
          ? 'bg-gradient-to-r from-red-50 via-rose-50 to-red-50 border-red-200'
          : anyWarning
          ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200'
          : 'bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border-blue-200/80'
      }`}
    >
      {/* Header: Title, Status Badge, & CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <span>🧪</span>
            <span>Batas Kuota Trial</span>
          </span>

          {anyExceeded ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-300">
              <AlertCircle className="w-3 h-3 text-red-600" />
              <span>Kuota Habis (Hard-Cap Terkunci)</span>
            </span>
          ) : anyWarning ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              <span>Mendekati Batas Kuota</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
              <span>Aktif</span>
              <span>•</span>
              <span>{daysLeft > 0 ? `Sisa ${daysLeft} Hari` : 'Hari Terakhir'}</span>
            </span>
          )}
        </div>

        {/* Action Button: Upgrade CTA */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            id="trial-quota-upgrade-btn"
            type="button"
            onClick={onUpgradeClick}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs hover:shadow transition-all active:scale-95 cursor-pointer text-white ${
              anyExceeded
                ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
                : anyWarning
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>Upgrade ke Paket Berbayar</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* Progress Bars Grid: 3 Standard Quota Resources */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
        {/* 1. Orders: Maksimal 30 Order */}
        <QuotaBar
          id="trial-quota-orders-bar"
          title="Pesanan Masuk"
          sublabel="Maksimal 30 Order"
          current={quota.orders.current}
          limit={quota.orders.limit}
          percent={quota.orders.percent}
          exceeded={quota.orders.exceeded}
          color={barColor(quota.orders.percent, quota.orders.exceeded)}
        />

        {/* 2. AI Bot: Maksimal 50 Interaksi AI */}
        <QuotaBar
          id="trial-quota-interactions-bar"
          title="Interaksi AI Bot"
          sublabel="Maksimal 50 Interaksi AI"
          current={quota.interactions.current}
          limit={quota.interactions.limit}
          percent={quota.interactions.percent}
          exceeded={quota.interactions.exceeded}
          color={barColor(quota.interactions.percent, quota.interactions.exceeded)}
        />

        {/* 3. WhatsApp: Maksimal 15 Notifikasi WA */}
        <QuotaBar
          id="trial-quota-wa-bar"
          title="Notifikasi WhatsApp"
          sublabel="Maksimal 15 Notifikasi WA"
          current={waQuota.current}
          limit={waQuota.limit}
          percent={waQuota.percent}
          exceeded={waQuota.exceeded}
          color={barColor(waQuota.percent, waQuota.exceeded)}
        />
      </div>

      {/* Exceeded Warning Footer */}
      {anyExceeded && (
        <div className="mt-3.5 p-2.5 rounded-xl bg-red-100/80 border border-red-200 text-red-800 text-[11px] font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            Batas kuota uji coba (Maksimal 30 Order, 50 Interaksi AI, dan 15 Notifikasi WA) telah tercapai. Tingkatkan paket sekarang untuk membuka transaksi & bot tanpa batas.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: individual progress bar card
// ---------------------------------------------------------------------------

interface QuotaBarProps {
  id: string;
  title: string;
  sublabel: string;
  current: number;
  limit: number;
  percent: number;
  exceeded: boolean;
  color: string;
}

function QuotaBar({ id, title, sublabel, current, limit, percent, exceeded, color }: QuotaBarProps) {
  return (
    <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-800">{title}</span>
        <span
          className={`font-black font-mono text-[11px] ${
            exceeded ? 'text-red-600' : percent >= 80 ? 'text-amber-600' : 'text-slate-600'
          }`}
        >
          {current} / {limit}
        </span>
      </div>

      {/* Track */}
      <div
        className="h-2 w-full bg-slate-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${title} (${sublabel})`}
        id={id}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(percent, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{sublabel}</span>
        <span className={`font-bold ${exceeded ? 'text-red-600' : 'text-slate-500'}`}>
          {exceeded ? 'Penuh (100%)' : `${percent}%`}
        </span>
      </div>
    </div>
  );
}
