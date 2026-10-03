'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  Sparkles,
  TrendingUp,
  Percent,
  BarChart3,
  MessageSquare,
  Eye,
  FileText,
  Megaphone,
  Target,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  ChevronDown,
  Download,
} from 'lucide-react';

const MASTER_PIN = '998877';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FeatureBreakdown {
  feature: string;
  tokens: number;
  cost_idr: number;
  event_count: number;
}

interface TenantAuditRow {
  tenant_slug: string;
  tenant_name?: string;
  tier?: string;
  total_tokens: number;
  total_cost_idr: number;
  event_count: number;
  p95_latency_ms: number | null;
  source?: string;
}

interface EconomicsSummary {
  total_revenue_idr: number;
  subscription_revenue_idr: number;
  topup_revenue_idr: number;
  total_ai_cost_idr: number;
  total_tokens: number;
  gross_margin_pct: number;
  tenant_count: number;
  revenue_source: string;
  cost_source: string;
}

interface ApiResponse {
  ok: boolean;
  period: string;
  from_date: string;
  generated_at: string;
  summary: EconomicsSummary;
  feature_breakdown: FeatureBreakdown[];
  tenant_audit: TenantAuditRow[];
}

// ── Feature metadata ──────────────────────────────────────────────────────────
const FEATURE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  WHATSAPP_BOT: {
    label: 'WhatsApp AI Bot',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    color: 'emerald',
  },
  BOONPILOT_CHAT: {
    label: 'BoonPilot Chat',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    color: 'blue',
  },
  VISION_SCAN: {
    label: 'Vision Scan',
    icon: <Eye className="w-3.5 h-3.5" />,
    color: 'purple',
  },
  LANDING_PAGE_GEN: {
    label: 'Landing Page Gen',
    icon: <FileText className="w-3.5 h-3.5" />,
    color: 'amber',
  },
  BROADCAST_AI: {
    label: 'Broadcast AI',
    icon: <Megaphone className="w-3.5 h-3.5" />,
    color: 'rose',
  },
  ADS_ANALYSIS: {
    label: 'Ads Tracking AI',
    icon: <Target className="w-3.5 h-3.5" />,
    color: 'cyan',
  },
  OTHER: {
    label: 'Lainnya',
    icon: <Cpu className="w-3.5 h-3.5" />,
    color: 'slate',
  },
};

const COLOR_MAP: Record<string, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  rose: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  slate: 'bg-slate-800 text-slate-400 border-slate-700',
};

function fmt(n: number) {
  return n.toLocaleString('id-ID');
}

function fmtM(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} Rb`;
  return String(n);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SuperAdminAIEconomicsPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [period, setPeriod] = useState<'MTD' | 'LAST30' | 'ALL'>('MTD');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      sessionStorage.setItem('super_admin_auth', 'true');
      setIsAdminAuth(true);
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/v1/admin/ai-economics?period=${period}&pin=${MASTER_PIN}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setError(`Gagal memuat data: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (isAdminAuth) {
      fetchData();
    }
  }, [isAdminAuth, fetchData]);

  // ── Login gate ──────────────────────────────────────────────────────────────
  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mx-auto mb-3 text-xl shadow-lg shadow-violet-500/10">
            🤖
          </div>
          <h1 className="text-lg font-bold text-white mb-1">AI Cost & Revenue Telemetry</h1>
          <p className="text-xs text-slate-400 mb-5">
            Dashboard biaya AI real-time: konsumsi token, gross margin, dan audit per tenant.
          </p>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              Buka AI Telemetry
            </button>
          </form>
        </div>
      </main>
    );
  }

  const s = data?.summary;
  const netProfit = s ? s.total_revenue_idr - s.total_ai_cost_idr : 0;
  const totalCostRatio = s && s.total_revenue_idr > 0
    ? ((s.total_ai_cost_idr / s.total_revenue_idr) * 100).toFixed(1)
    : '0';

  // Sort feature_breakdown by cost desc
  const sortedFeatures = [...(data?.feature_breakdown || [])].sort(
    (a, b) => b.cost_idr - a.cost_idr,
  );
  const maxFeatureCost = sortedFeatures[0]?.cost_idr || 1;

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 md:p-8 lg:p-10 antialiased selection:bg-violet-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Kembali ke Superadmin Cockpit"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  AI Cost Intelligence
                </span>
                <span className="text-[11px] text-slate-400">• Gross Margin Engine</span>
                {lastRefresh && (
                  <span className="text-[10px] text-slate-500">
                    Diperbarui {lastRefresh.toLocaleTimeString('id-ID')}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-black text-white mt-1">
                AI Revenue & Cost Telemetry Dashboard
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="relative">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as 'MTD' | 'LAST30' | 'ALL')}
                className="appearance-none pl-3 pr-8 py-2 bg-slate-900 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="MTD">📅 Bulan Ini (MTD)</option>
                <option value="LAST30">🗓 30 Hari Terakhir</option>
                <option value="ALL">🗃 Semua Waktu</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet-400' : ''}`} />
            </button>

            <Link
              href="/admin/telemetry"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition"
            >
              📊 Telemetri Trafik
            </Link>
            <Link
              href="/admin/economics"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition"
            >
              💰 Unit Economics
            </Link>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-rose-950/50 border border-rose-500/30 rounded-2xl text-rose-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Data source notice */}
        {data && (s?.revenue_source !== 'credit_transactions' || s?.cost_source !== 'credit_consumption_events') && (
          <div className="flex items-start gap-2.5 p-4 bg-amber-950/30 border border-amber-500/25 rounded-2xl text-amber-400 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Mode Estimasi Aktif</p>
              <p className="text-amber-400/80">
                Tabel <code className="bg-amber-500/10 px-1 rounded">credit_consumption_events</code> dan{' '}
                <code className="bg-amber-500/10 px-1 rounded">credit_transactions</code> belum terisi data.
                Jalankan migration SQL lalu pastikan semua AI invocation memanggil{' '}
                <code className="bg-amber-500/10 px-1 rounded">lib/creditLedger.ts</code> untuk write events.
                Angka estimasi diambil dari <code className="bg-amber-500/10 px-1 rounded">tenants.metadata</code>.
              </p>
            </div>
          </div>
        )}

        {/* ── 4 Core KPI Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Revenue */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total Revenue
              </span>
              <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <>
                <div className="text-2xl font-black text-white tracking-tight">
                  Rp {s ? fmtM(s.total_revenue_idr) : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Subs: Rp {s ? fmtM(s.subscription_revenue_idr) : '0'}
                  {' '}· Top-up: Rp {s ? fmtM(s.topup_revenue_idr) : '0'}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center gap-1 text-[10px] text-slate-500">
                  <Users className="w-3 h-3" />
                  <span>{s?.tenant_count || 0} tenant aktif</span>
                </div>
              </>
            )}
          </div>

          {/* Card 2: Total AI Cost */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total AI Cost
              </span>
              <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <>
                <div className="text-2xl font-black text-white tracking-tight">
                  Rp {s ? fmtM(s.total_ai_cost_idr) : '—'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {s ? (s.total_tokens / 1_000_000).toFixed(2) : '0'}M tokens terpakai
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800 text-[10px] text-slate-500">
                  {totalCostRatio}% dari revenue
                </div>
              </>
            )}
          </div>

          {/* Card 3: Gross Margin */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Gross Margin (%)
              </span>
              <div className="p-1.5 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <>
                <div className={`text-2xl font-black tracking-tight ${
                  (s?.gross_margin_pct || 0) >= 60
                    ? 'text-emerald-400'
                    : (s?.gross_margin_pct || 0) >= 30
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}>
                  {s?.gross_margin_pct ?? '—'}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Net: Rp {fmtM(netProfit)}/periode
                </div>
                {/* Margin bar */}
                <div className="mt-3 w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-700 ${
                      (s?.gross_margin_pct || 0) >= 60 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, s?.gross_margin_pct || 0)}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Card 4: Avg Cost Per Tenant */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Avg Cost / Tenant
              </span>
              <div className="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <>
                <div className="text-2xl font-black text-white tracking-tight">
                  Rp {s && s.tenant_count > 0
                    ? fmtM(Math.round(s.total_ai_cost_idr / s.tenant_count))
                    : '0'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Avg token/tenant:{' '}
                  {s && s.tenant_count > 0
                    ? ((s.total_tokens / s.tenant_count) / 1000).toFixed(0)
                    : '0'}K
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>High-margin SaaS model</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Feature Breakdown + Revenue Split ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Feature Breakdown */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-bold text-white">Breakdown Konsumsi per Fitur</h3>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-slate-800 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : sortedFeatures.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Belum ada data konsumsi fitur.
                <br />Data akan muncul setelah migration dijalankan.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedFeatures.map((f) => {
                  const meta = FEATURE_META[f.feature] || FEATURE_META.OTHER;
                  const colorClass = COLOR_MAP[meta.color] || COLOR_MAP.slate;
                  const widthPct = Math.round((f.cost_idr / maxFeatureCost) * 100);
                  return (
                    <div key={f.feature}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border ${colorClass}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-bold text-white">Rp {fmt(f.cost_idr)}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {(f.tokens / 1_000).toFixed(0)}K tokens · {f.event_count} calls
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-violet-500/60 transition-all duration-700"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Revenue Split */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">P&L Breakdown (Periode {period})</h3>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-slate-800 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  {
                    label: 'Revenue Langganan (Subscription)',
                    value: s?.subscription_revenue_idr || 0,
                    type: 'income',
                    note: `${s?.tenant_count || 0} tenant aktif`,
                  },
                  {
                    label: 'Revenue Top-up Kredit',
                    value: s?.topup_revenue_idr || 0,
                    type: 'income',
                    note: 'Kredit tambahan',
                  },
                  {
                    label: 'Biaya AI (Gemini LLM)',
                    value: -(s?.total_ai_cost_idr || 0),
                    type: 'cost',
                    note: `${s ? (s.total_tokens / 1_000_000).toFixed(2) : '0'}M tokens`,
                  },
                  {
                    label: 'NET PROFIT (Estimasi)',
                    value: netProfit,
                    type: netProfit >= 0 ? 'profit' : 'loss',
                    note: `Margin: ${s?.gross_margin_pct || 0}%`,
                    bold: true,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                      row.bold
                        ? row.type === 'profit'
                          ? 'bg-emerald-950/30 border-emerald-500/25'
                          : 'bg-rose-950/30 border-rose-500/25'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div>
                      <p className={`text-xs font-semibold ${row.bold ? 'text-white' : 'text-slate-300'}`}>
                        {row.label}
                      </p>
                      <p className="text-[10px] text-slate-500">{row.note}</p>
                    </div>
                    <span className={`text-sm font-black ${
                      row.type === 'income'
                        ? 'text-emerald-400'
                        : row.type === 'profit'
                        ? 'text-emerald-400'
                        : row.type === 'loss'
                        ? 'text-rose-400'
                        : 'text-rose-400'
                    }`}>
                      {row.value >= 0 ? '+' : ''}Rp {fmtM(Math.abs(row.value))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Per-Tenant Audit Table ────────────────────────────────────── */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Audit Per Tenant (Top 20 by AI Cost)</h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Konsumsi token, biaya aktual IDR, dan P95 latency per toko. Sorted by cost tertinggi.
              </p>
            </div>
            <button
              onClick={() => {
                if (!data?.tenant_audit) return;
                const csv = [
                  ['Tenant', 'Tier', 'Tokens', 'Cost IDR', 'Events', 'P95 Latency (ms)'],
                  ...data.tenant_audit.map((r) => [
                    r.tenant_slug, r.tier || '-', r.total_tokens,
                    r.total_cost_idr, r.event_count, r.p95_latency_ms ?? '-',
                  ]),
                ].map((row) => row.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ai-cost-audit-${period.toLowerCase()}.csv`;
                a.click();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center">
              <RefreshCw className="w-5 h-5 animate-spin text-violet-400 mx-auto mb-2" />
              <span className="text-xs text-slate-500">Memuat audit tenant...</span>
            </div>
          ) : !data?.tenant_audit || data.tenant_audit.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">
              Belum ada data audit tenant. Jalankan migration SQL terlebih dahulu.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-950/80 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Tenant / Toko</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Total Tokens</th>
                    <th className="px-4 py-3">Biaya AI (IDR)</th>
                    <th className="px-4 py-3">AI Calls</th>
                    <th className="px-4 py-3">P95 Latency</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {data.tenant_audit.map((row, idx) => (
                    <tr key={row.tenant_slug} className="hover:bg-slate-900/50 transition">
                      <td className="px-4 py-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                          idx === 0 ? 'bg-amber-500 text-slate-950'
                          : idx === 1 ? 'bg-slate-300 text-slate-950'
                          : idx === 2 ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white font-mono text-[11px]">
                          {row.tenant_slug}
                        </p>
                        {row.tenant_name && (
                          <p className="text-[10px] text-slate-400">{row.tenant_name}</p>
                        )}
                        {row.source === 'metadata_fallback' && (
                          <span className="text-[9px] text-amber-500">estimasi</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.tier ? (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            (row.tier || '').includes('ENTERPRISE') || (row.tier || '').includes('TEAM')
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : (row.tier || '').includes('ADS') || (row.tier || '').includes('PRO')
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {row.tier}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-200">
                        {(row.total_tokens / 1000).toFixed(0)}K
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-violet-300">
                          Rp {fmt(row.total_cost_idr)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {row.event_count > 0 ? fmt(row.event_count) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.p95_latency_ms != null ? (
                          <span className={`font-semibold flex items-center gap-1 ${
                            row.p95_latency_ms > 2000 ? 'text-rose-400'
                            : row.p95_latency_ms > 800 ? 'text-amber-400'
                            : 'text-emerald-400'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {row.p95_latency_ms}ms
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/${row.tenant_slug}/dashboard`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                        >
                          Review
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer metadata */}
        {data && (
          <div className="text-center text-[10px] text-slate-600">
            Data diambil dari tabel{' '}
            <code className="bg-slate-900 px-1 rounded">credit_consumption_events</code> &{' '}
            <code className="bg-slate-900 px-1 rounded">credit_transactions</code> ·{' '}
            Periode: {period} · Generated: {new Date(data.generated_at).toLocaleString('id-ID')}
          </div>
        )}
      </div>
    </main>
  );
}
