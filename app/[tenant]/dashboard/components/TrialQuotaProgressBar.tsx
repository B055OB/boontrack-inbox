'use client';

/**
 * @file TrialQuotaProgressBar.tsx
 * @description Dashboard widget: visual trial usage progress bar.
 *
 * Shows merchant their current trial resource consumption:
 *   - Orders: X / 30
 *   - AI / WhatsApp Interactions: X / 50
 *
 * Only rendered when isTrial = true. Non-trial tenants see nothing.
 * Upgrade CTA is displayed when any resource approaches or exceeds limit.
 *
 * @architecture BATCH 1 / Ticket 1.2
 */

import { useEffect, useState } from 'react';

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

  const daysLeft = trial_ends_at
    ? Math.max(0, Math.ceil((new Date(trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const anyExceeded = quota.orders.exceeded || quota.interactions.exceeded;
  const anyWarning = quota.orders.percent >= 80 || quota.interactions.percent >= 80;

  const barColor = (percent: number, exceeded: boolean): string => {
    if (exceeded) return '#ef4444'; // red-500
    if (percent >= 80) return '#f59e0b'; // amber-500
    return '#6366f1'; // indigo-500
  };

  return (
    <div
      style={{
        background: anyExceeded
          ? 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)'
          : anyWarning
          ? 'linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%)'
          : 'linear-gradient(135deg, #f0f4ff 0%, #eef2ff 100%)',
        border: `1px solid ${anyExceeded ? '#fca5a5' : anyWarning ? '#fcd34d' : '#c7d2fe'}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '16px',
        fontFamily: 'inherit',
      }}
      role="region"
      aria-label="Pemakaian Kuota Trial"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: anyExceeded ? '#dc2626' : anyWarning ? '#d97706' : '#4f46e5',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            🧪 Masa Uji Coba Gratis
          </span>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
            {daysLeft > 0
              ? `Sisa ${daysLeft} hari lagi`
              : 'Masa trial telah berakhir'}
          </p>
        </div>
        {(anyExceeded || anyWarning) && (
          <button
            id="trial-quota-upgrade-btn"
            onClick={onUpgradeClick}
            style={{
              background: anyExceeded ? '#dc2626' : '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Upgrade Sekarang →
          </button>
        )}
      </div>

      {/* Progress Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <QuotaBar
          label={quota.orders.label}
          current={quota.orders.current}
          limit={quota.orders.limit}
          percent={quota.orders.percent}
          exceeded={quota.orders.exceeded}
          color={barColor(quota.orders.percent, quota.orders.exceeded)}
          id="trial-quota-orders-bar"
        />
        <QuotaBar
          label={quota.interactions.label}
          current={quota.interactions.current}
          limit={quota.interactions.limit}
          percent={quota.interactions.percent}
          exceeded={quota.interactions.exceeded}
          color={barColor(quota.interactions.percent, quota.interactions.exceeded)}
          id="trial-quota-interactions-bar"
        />
      </div>

      {/* Exceeded message */}
      {anyExceeded && (
        <p
          style={{
            marginTop: '10px',
            fontSize: '12px',
            color: '#dc2626',
            fontWeight: 500,
            lineHeight: 1.5,
          }}
        >
          ⚠️ Batas kuota uji coba telah tercapai. Upgrade ke paket berbayar untuk melanjutkan menerima pesanan & mengaktifkan AI Bot tanpa batas.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: individual progress bar
// ---------------------------------------------------------------------------

interface QuotaBarProps {
  id: string;
  label: string;
  current: number;
  limit: number;
  percent: number;
  exceeded: boolean;
  color: string;
}

function QuotaBar({ id, label, current, limit, percent, exceeded, color }: QuotaBarProps) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontSize: '11px',
            color: exceeded ? '#dc2626' : '#6b7280',
            fontWeight: exceeded ? 700 : 400,
          }}
        >
          {exceeded ? '🔴 Penuh' : `${percent}%`}
        </span>
      </div>
      {/* Track */}
      <div
        style={{
          height: '6px',
          backgroundColor: '#e5e7eb',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
        id={id}
      >
        {/* Fill */}
        <div
          style={{
            height: '100%',
            width: `${Math.min(percent, 100)}%`,
            backgroundColor: color,
            borderRadius: '9999px',
            transition: 'width 0.4s ease, background-color 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
