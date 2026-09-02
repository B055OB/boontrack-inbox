'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  Copy,
  Check,
  ExternalLink,
  Wallet,
  CheckCircle2,
  RefreshCw,
  MousePointerClick,
  ShoppingBag,
  ShieldCheck,
  Search,
} from 'lucide-react';

interface PortalResponse {
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

export default function AffiliatePortalPage() {
  const searchParams = useSearchParams();
  const initialTenant = searchParams.get('tenant') || 'cornvest';
  const initialRef = searchParams.get('ref') || searchParams.get('code') || 'ANDI';

  const [tenantSlug, setTenantSlug] = useState(initialTenant);
  const [affiliateCode, setAffiliateCode] = useState(initialRef);
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchAffiliateData = useCallback(async (tSlug: string, aCode: string) => {
    if (!tSlug || !aCode) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(
        `https://api.boontrack.com/api/v1/growth/portal/${tSlug.trim().toLowerCase()}/${aCode.trim().toUpperCase()}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.detail || 'Data affiliate tidak ditemukan');
      }
      setData(json.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat portal affiliate';
      setErrorMsg(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAffiliateData(tenantSlug, affiliateCode);
  }, [fetchAffiliateData, tenantSlug, affiliateCode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAffiliateData(tenantSlug, affiliateCode);
  };

  const copyToClipboard = () => {
    if (!data?.referral_url) return;
    navigator.clipboard.writeText(data.referral_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-blue-600 selection:text-white">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header Portal */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl backdrop-blur-md shadow-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>P2 Growth Engine</span>
              </span>
              <span className="text-xs text-slate-400">&bull; Live Multi-Tenant Portal</span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1.5">
              {data ? `Halo, ${data.affiliate.name} ??` : 'Affiliate Partner Dashboard'}
            </h1>
            <p className="text-xs text-slate-400">
              Pantau performa traffic, konversi pesanan, dan komisi siap cair secara real-time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchAffiliateData(tenantSlug, affiliateCode)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-300">
              Tenant: <strong className="text-white uppercase">{tenantSlug}</strong>
            </div>
          </div>
        </div>

        {/* Filter Toolbar / Selector */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl">
          <div className="w-full sm:w-1/3">
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tenant Slug</label>
            <input
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="cornvest"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="w-full sm:w-1/3">
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Kode Referral</label>
            <input
              type="text"
              value={affiliateCode}
              onChange={(e) => setAffiliateCode(e.target.value)}
              placeholder="ANDI"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 uppercase"
            />
          </div>
          <div className="w-full sm:w-auto self-end pt-2 sm:pt-0">
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Cari Partner</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-center">
            {errorMsg} (Pastikan tenant dan kode referral sudah terdaftar di database).
          </div>
        )}

        {data && (
          <>
            {/* Referral Link Box */}
            <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/30 rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span>Link Referral Aktif</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Rate Komisi: <strong className="text-emerald-400 font-bold">{data.affiliate.commission_rate}%</strong>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={data.referral_url}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 font-mono focus:outline-none select-all"
                />
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 sm:flex-none px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
                  </button>
                  <a
                    href={data.referral_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition flex items-center justify-center cursor-pointer"
                    title="Buka Toko"
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
                <div className="text-2xl font-black text-white mt-2">{data.metrics.total_clicks}</div>
                <span className="text-[10px] text-slate-500">Sesi kunjungan terdata</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <ShoppingBag className="w-4 h-4 text-indigo-400" />
                  <span>Pesanan Selesai</span>
                </div>
                <div className="text-2xl font-black text-white mt-2">{data.metrics.total_orders}</div>
                <span className="text-[10px] text-slate-500">Status order PAID</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                  <Wallet className="w-4 h-4" />
                  <span>Siap Dicairkan</span>
                </div>
                <div className="text-2xl font-black text-emerald-400 mt-2">
                  Rp{data.metrics.ready_to_withdraw.toLocaleString('id-ID')}
                </div>
                <span className="text-[10px] text-slate-500">Saldo APPROVED di ledger</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  <span>Sudah Ditransfer</span>
                </div>
                <div className="text-2xl font-black text-white mt-2">
                  Rp{data.metrics.already_paid.toLocaleString('id-ID')}
                </div>
                <span className="text-[10px] text-slate-500">Riwayat pencairan payout</span>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
