'use client';

import React, { useEffect, useState, use } from 'react';
import {
  Wallet,
  MousePointerClick,
  ShoppingBag,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';

interface PortalData {
  affiliate: {
    id: string;
    name: string;
    phone_number: string;
    referral_code: string;
    commission_rate: number;
    status: string;
  };
  referral_url: string;
  metrics: {
    total_clicks: number;
    total_orders: number;
    ready_to_withdraw: number;
    already_paid: number;
  };
}

export default function AffiliatePortalPage({
  params,
}: {
  params: Promise<{ tenant: string; code: string }>;
}) {
  const resolvedParams = use(params);
  const { tenant, code } = resolvedParams;

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const fetchPortalData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(
        `https://api.boontrack.com/api/v1/growth/portal/${tenant}/${code}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.detail || 'Data affiliate tidak ditemukan');
      }
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat portal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, [tenant, code]);

  const copyToClipboard = () => {
    if (!data?.referral_url) return;
    navigator.clipboard.writeText(data.referral_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Memuat Portal Mitra Affiliate...</span>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3 font-bold">
            ✕
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Affiliate Tidak Ditemukan</h1>
          <p className="text-xs text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchPortalData}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl"
          >
            Coba Lagi
          </button>
        </div>
      </main>
    );
  }

  const { affiliate, metrics, referral_url } = data;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 selection:bg-blue-600 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Mitra Terverifikasi</span>
              </span>
              <span className="text-xs text-slate-400 capitalize">&bull; Tenant: {tenant}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5">
              Halo, {affiliate.name} 👋
            </h1>
            <p className="text-xs text-slate-400">
              Pantau performa penjualan, tautan referral, dan saldo komisi real-time Anda.
            </p>
          </div>

          <button
            onClick={fetchPortalData}
            className="self-start sm:self-center p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Link Referral Generator Box */}
        <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/30 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span>Link Referral Toko Anda</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Komisi: <strong className="text-white">{affiliate.commission_rate}%</strong> per pesanan
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={referral_url}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-mono focus:outline-none select-all"
            />
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-1.5"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
              </button>
              <a
                href={referral_url}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition flex items-center justify-center"
                title="Buka Link Toko"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Performance Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <MousePointerClick className="w-4 h-4 text-cyan-400" />
              <span>Total Klik</span>
            </div>
            <div className="text-2xl font-black text-white mt-2">{metrics.total_clicks}</div>
            <span className="text-[10px] text-slate-500">Kunjungan unik referral</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <ShoppingBag className="w-4 h-4 text-indigo-400" />
              <span>Pesanan Sukses</span>
            </div>
            <div className="text-2xl font-black text-white mt-2">{metrics.total_orders}</div>
            <span className="text-[10px] text-slate-500">Transaksi berstatus PAID</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <Wallet className="w-4 h-4" />
              <span>Siap Dicairkan</span>
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-2">
              Rp{metrics.ready_to_withdraw.toLocaleString('id-ID')}
            </div>
            <span className="text-[10px] text-slate-500">Saldo APPROVED di ledger</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span>Sudah Ditransfer</span>
            </div>
            <div className="text-2xl font-black text-white mt-2">
              Rp{metrics.already_paid.toLocaleString('id-ID')}
            </div>
            <span className="text-[10px] text-slate-500">Riwayat pencairan selesai</span>
          </div>
        </div>
      </div>
    </main>
  );
}