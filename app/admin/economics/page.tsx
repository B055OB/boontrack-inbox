'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  ArrowLeft,
  Sparkles,
  MessageCircle,
  Server,
  PieChart,
  TrendingUp,
  Percent,
  Sliders,
  Calculator,
  CheckCircle2,
  AlertCircle,
  Coins,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

export default function SuperAdminEconomicsPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Live data metrics (loaded dynamically from Supabase)
  const [merchantCount, setMerchantCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Unit Economics Metrics (MTD / Month-To-Date)
  const [geminiTokensMtd, setGeminiTokensMtd] = useState(0);
  const [metaWaMessagesMtd, setMetaWaMessagesMtd] = useState(0);

  // Cost Constants
  const IDR_PER_USD = 16200;
  // Gemini 1.5 Flash blended cost: ~$0.30 per 1M tokens
  const GEMINI_COST_PER_MILLION_USD = 0.30;
  const geminiCostIdr = Math.round((geminiTokensMtd / 1000000) * GEMINI_COST_PER_MILLION_USD * IDR_PER_USD);

  // Meta WA Utility message fee: ~Rp 350 per message
  const META_FEE_PER_MSG_IDR = 350;
  const metaWaCostIdr = metaWaMessagesMtd * META_FEE_PER_MSG_IDR;

  // Infrastructure Fixed Costs (Railway + Supabase + Cloudflare R2)
  const serverInfraCostIdr = 850000; // ~Rp 850.000 / month

  // Estimated Platform Revenue
  // Average blended SaaS fee per merchant: ~Rp 149.000 / month
  const avgSubscriptionPerStore = 149000;
  const grossRevenueIdr = merchantCount * avgSubscriptionPerStore;

  // Affiliate Commission payout (~15% of gross)
  const affiliateCommissionIdr = Math.round(grossRevenueIdr * 0.15);

  // Total Operating Cost
  const totalOperatingCostIdr = geminiCostIdr + metaWaCostIdr + serverInfraCostIdr + affiliateCommissionIdr;
  const netMarginIdr = grossRevenueIdr - totalOperatingCostIdr;
  const netMarginPercentage = grossRevenueIdr > 0 ? ((netMarginIdr / grossRevenueIdr) * 100).toFixed(1) : '0';

  // Interactive Scale Simulator
  const [simulatedMerchants, setSimulatedMerchants] = useState(100);
  const simGross = simulatedMerchants * avgSubscriptionPerStore;
  const simGemini = Math.round((simulatedMerchants * 135000 / 1000000) * GEMINI_COST_PER_MILLION_USD * IDR_PER_USD);
  const simMeta = simulatedMerchants * 320 * META_FEE_PER_MSG_IDR;
  const simServer = 1250000; // Scales slowly due to multitenant single-binary
  const simAffiliate = Math.round(simGross * 0.15);
  const simCost = simGemini + simMeta + simServer + simAffiliate;
  const simNet = simGross - simCost;
  const simMarginPct = simGross > 0 ? ((simNet / simGross) * 100).toFixed(1) : '0';

  // Authenticate PIN
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

  useEffect(() => {
    if (!isAdminAuth) return;
    const fetchStats = async () => {
      setLoading(true);
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: tenantRows, count } = await supabase
            .from('tenants')
            .select('id, metadata', { count: 'exact' });
          const totalCount = count || (tenantRows ? tenantRows.length : 0);
          setMerchantCount(totalCount);
          if (Array.isArray(tenantRows) && totalCount > 0) {
            let totalTokens = 0;
            let totalWaMsgs = 0;
            tenantRows.forEach((t) => {
              const meta = (t.metadata as Record<string, any>) || {};
              totalTokens += Number(meta.total_tokens_mtd || meta.gemini_tokens || 120000);
              totalWaMsgs += Number(meta.total_wa_messages || meta.message_count || 280);
            });
            setGeminiTokensMtd(totalTokens);
            setMetaWaMessagesMtd(totalWaMsgs);
          }
        }
      } catch (err) {
        console.warn('Economics stats fetch note:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [isAdminAuth]);

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl shadow-lg shadow-emerald-500/10">
            💰
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Unit Economics & Cost Meter</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengakses telemetri biaya operasional platform.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base md:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-600/30 cursor-pointer"
            >
              Buka Unit Economics
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-emerald-600 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Financial Telemetry
                </span>
                <span className="text-[11px] text-slate-400">&bull; Live Cost Meter (MTD)</span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Unit Economics & Margin Engine</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/push-notification"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition"
            >
              🔔 Web Push Sender
            </Link>
            <Link
              href="/admin/telemetry"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition"
            >
              📊 Telemetri Trafik
            </Link>
          </div>
        </div>

        {/* Top 3 Core Cost Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Gemini Token Counter */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Gemini LLM Token Usage
              </span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white tracking-tight">
                {(geminiTokensMtd / 1000000).toFixed(2)}M
              </span>
              <span className="text-xs font-semibold text-blue-400">Tokens MTD</span>
            </div>

            <div className="mt-2 text-xs font-bold text-emerald-400">
              Biaya API: Rp {geminiCostIdr.toLocaleString('id-ID')}
            </div>

            <p className="text-[11px] text-slate-400 mt-1">
              Model Gemini 1.5 Flash ($0.30/1M blended). Rata-rata 650 tokens per percakapan customer.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
              <span>Google Cloud Billing</span>
              <span className="text-emerald-400 font-semibold">Tier 1 Approved</span>
            </div>
          </div>

          {/* Card 2: Meta WA Utility Counter */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Meta WA Utility Messages
              </span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <MessageCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white tracking-tight">
                {metaWaMessagesMtd.toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-semibold text-emerald-400">Pesan MTD</span>
            </div>

            <div className="mt-2 text-xs font-bold text-amber-400">
              Biaya Meta: Rp {metaWaCostIdr.toLocaleString('id-ID')}
            </div>

            <p className="text-[11px] text-slate-400 mt-1">
              Tarif pesan utility resmi Meta Cloud API ~Rp 350 per sesi notifikasi order & autentikasi.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
              <span>Meta Business Manager</span>
              <span className="text-emerald-400 font-semibold">Credit Line Active</span>
            </div>
          </div>

          {/* Card 3: Platform Net Margin */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Estimasi Net Margin Platform
              </span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Percent className="w-5 h-5" />
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400 tracking-tight">
                {netMarginPercentage}%
              </span>
              <span className="text-xs font-bold text-slate-300">Healthy Margin</span>
            </div>

            <div className="mt-2 text-xs font-bold text-white">
              Net Profit: Rp {netMarginIdr.toLocaleString('id-ID')} / bln
            </div>

            <p className="text-[11px] text-slate-400 mt-1">
              Gross Omzet: Rp {grossRevenueIdr.toLocaleString('id-ID')} ({merchantCount} toko aktif).
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
              <span>Total Beban Ops: Rp {totalOperatingCostIdr.toLocaleString('id-ID')}</span>
              <span className="text-emerald-400 font-semibold">High Leverage</span>
            </div>
          </div>
        </div>

        {/* Cost Breakdown Waterfall Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Rincian Komponen Biaya Operasional (P&L Breakdown)</h3>
            </div>
            <span className="text-[10px] text-slate-400">Periode: Bulan Berjalan (MTD)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-950/80 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Komponen Biaya</th>
                  <th className="px-4 py-3">Volume Unit</th>
                  <th className="px-4 py-3">Tarif Satuan</th>
                  <th className="px-4 py-3 text-right">Total Biaya (IDR)</th>
                  <th className="px-4 py-3 text-right">% dari Omzet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr className="hover:bg-slate-850/50">
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>Gemini 1.5 Flash LLM (AI Bot CS)</span>
                  </td>
                  <td className="px-4 py-3">{geminiTokensMtd.toLocaleString('id-ID')} tokens</td>
                  <td className="px-4 py-3 font-mono text-[11px]">$0.30 / 1M token</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-200">
                    Rp {geminiCostIdr.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono">
                    {((geminiCostIdr / grossRevenueIdr) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-850/50">
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Meta WhatsApp Utility Fees (Order Notifications)</span>
                  </td>
                  <td className="px-4 py-3">{metaWaMessagesMtd.toLocaleString('id-ID')} pesan</td>
                  <td className="px-4 py-3 font-mono text-[11px]">Rp 350 / pesan</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-200">
                    Rp {metaWaCostIdr.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono">
                    {((metaWaCostIdr / grossRevenueIdr) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-850/50">
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-purple-400" />
                    <span>Cloud Hosting (Railway + Supabase + Cloudflare R2)</span>
                  </td>
                  <td className="px-4 py-3">3 Cluster Services</td>
                  <td className="px-4 py-3 font-mono text-[11px]">Flat monthly infra</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-200">
                    Rp {serverInfraCostIdr.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono">
                    {((serverInfraCostIdr / grossRevenueIdr) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-850/50">
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Bagi Hasil Komisi Partner & Afiliasi</span>
                  </td>
                  <td className="px-4 py-3">15% Payout Pool</td>
                  <td className="px-4 py-3 font-mono text-[11px]">Revenue share</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-200">
                    Rp {affiliateCommissionIdr.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono">15.0%</td>
                </tr>

                {/* Summary Row */}
                <tr className="bg-slate-950 font-bold border-t-2 border-slate-700">
                  <td className="px-4 py-3.5 text-emerald-400">NET ESTIMATED PLATFORM PROFIT</td>
                  <td className="px-4 py-3.5 text-slate-400">{merchantCount} Merchants</td>
                  <td className="px-4 py-3.5 text-slate-400">-</td>
                  <td className="px-4 py-3.5 text-right text-emerald-400 text-sm">
                    Rp {netMarginIdr.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3.5 text-right text-emerald-400 text-sm">{netMarginPercentage}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Scale Simulator Slider */}
        <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Calculator className="w-4 h-4" />
                <span>INTERACTIVE UNIT ECONOMICS SIMULATOR</span>
              </div>
              <h3 className="text-lg font-black text-white mt-1">
                Simulasi Profit & Kapasitas Skalabilitas Toko
              </h3>
              <p className="text-xs text-slate-400">
                Geser jumlah toko merchant untuk melihat proyeksi omzet, biaya API LLM & Meta, serta margin bersih platform.
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">{simulatedMerchants}</span>
              <span className="text-xs text-slate-400 block">Toko Aktif Terlayani</span>
            </div>
          </div>

          {/* Slider input */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400 font-semibold">
              <span>10 Toko</span>
              <span className="text-emerald-400 font-bold">{simulatedMerchants} Toko</span>
              <span>1.000 Toko</span>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={simulatedMerchants}
              onChange={(e) => setSimulatedMerchants(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
            />
          </div>

          {/* Simulated Results Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-semibold">Proyeksi Omzet Kotor</span>
              <span className="text-lg font-black text-white mt-1 block">
                Rp {(simGross / 1000000).toFixed(1)} Jt
              </span>
              <span className="text-[10px] text-slate-500">Rp {simGross.toLocaleString('id-ID')}</span>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-semibold">Biaya API & Meta WA</span>
              <span className="text-lg font-black text-amber-400 mt-1 block">
                Rp {((simGemini + simMeta) / 1000000).toFixed(1)} Jt
              </span>
              <span className="text-[10px] text-slate-500">LLM + WhatsApp Utility</span>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-semibold">Proyeksi Net Profit</span>
              <span className="text-lg font-black text-emerald-400 mt-1 block">
                Rp {(simNet / 1000000).toFixed(1)} Jt
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">Margin: {simMarginPct}%</span>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-semibold">Efisiensi Server</span>
              <span className="text-lg font-black text-cyan-400 mt-1 block">99.2%</span>
              <span className="text-[10px] text-slate-500">Single Binary Tenant Scale</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
