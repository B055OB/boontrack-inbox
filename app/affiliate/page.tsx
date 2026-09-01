"use client";

import React, { useState, useEffect } from "react";
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Copy, 
  Check, 
  ExternalLink, 
  ArrowUpRight, 
  Wallet, 
  Clock, 
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { getSupabase } from "@/lib/supabaseClient";

interface CommissionRow {
  id: string;
  order_id: string;
  created_at: string;
  tenant_slug: string;
  gross_amount: number;
  affiliate_commission_amount: number;
  status: string;
}

export default function AffiliatePortalPage() {
  const [copied, setCopied] = useState(false);
  const [affiliateCode, setAffiliateCode] = useState("BOON-SUPER");
  const [loading, setLoading] = useState(true);
  
  const [stats, setStats] = useState({
    totalEarnings: 0,
    pendingPayout: 0,
    totalReferrals: 0,
    conversionRate: "0%"
  });

  const [ledger, setLedger] = useState<CommissionRow[]>([]);

  const referralLink = `https://shop.boontrack.com/suhuads?ref=${affiliateCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchAffiliateData = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: rows, error } = await supabase
        .from("commission_ledger")
        .select("*")
        .eq("affiliate_code", affiliateCode)
        .order("created_at", { ascending: false });

      if (rows && !error) {
        setLedger(rows as CommissionRow[]);

        const totalEarned = rows.reduce((sum: number, r: any) => sum + Number(r.affiliate_commission_amount || 0), 0);
        const pending = rows
          .filter((r: any) => r.status === "PENDING_PAYOUT")
          .reduce((sum: number, r: any) => sum + Number(r.affiliate_commission_amount || 0), 0);

        setStats({
          totalEarnings: totalEarned,
          pendingPayout: pending,
          totalReferrals: rows.length,
          conversionRate: rows.length > 0 ? "100%" : "0%"
        });
      }
    } catch (err) {
      console.error("Failed to load affiliate ledger:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAffiliateData();
  }, [affiliateCode]);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Portal */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
                Marketer Hub
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">Affiliate Partner Dashboard</h1>
            <p className="text-xs text-slate-400">Pantau klik, konversi link, dan pencairan komisi penjualan Anda.</p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={fetchAffiliateData} 
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer">
              <Wallet className="w-4 h-4" /> Tarik Komisi
            </button>
          </div>
        </div>

        {/* Link Generator Box */}
        <div className="bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-900/40 p-5 rounded-3xl space-y-3">
          <label className="text-xs font-bold text-blue-300 block">Link Referral Aktif Anda:</label>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-base md:text-xs px-4 py-3 rounded-xl font-mono focus:outline-none"
            />
            <button
              onClick={copyToClipboard}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4 text-white" />}
              <span>{copied ? "Tersalin!" : "Salin Link"}</span>
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Total Komisi Didapat</span>
            <h3 className="text-xl font-black text-white">Rp {stats.totalEarnings.toLocaleString("id-ID")}</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Siap Ditarik</span>
            <h3 className="text-xl font-black text-emerald-400">Rp {stats.pendingPayout.toLocaleString("id-ID")}</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Total Transaksi</span>
            <h3 className="text-xl font-black text-white">{stats.totalReferrals} Order</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Conversion Rate</span>
            <h3 className="text-xl font-black text-blue-400">{stats.conversionRate}</h3>
          </div>
        </div>

        {/* Riwayat Transaksi */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Riwayat Komisi Penjualan</h2>
            <span className="text-xs text-slate-500">Live Supabase Sync</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-3 font-semibold">Order ID</th>
                  <th className="pb-3 font-semibold">Waktu</th>
                  <th className="pb-3 font-semibold">Tenant</th>
                  <th className="pb-3 font-semibold">Nominal Order</th>
                  <th className="pb-3 font-semibold">Komisi Anda</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      {loading ? "Memuat data komisi..." : "Belum ada riwayat transaksi untuk kode referral ini."}
                    </td>
                  </tr>
                ) : (
                  ledger.map((row) => (
                    <tr key={row.id} className="text-slate-300">
                      <td className="py-3.5 font-mono text-slate-400">{row.order_id}</td>
                      <td className="py-3.5">{new Date(row.created_at).toLocaleDateString("id-ID")}</td>
                      <td className="py-3.5 font-medium text-white uppercase">{row.tenant_slug}</td>
                      <td className="py-3.5">Rp {Number(row.gross_amount).toLocaleString("id-ID")}</td>
                      <td className="py-3.5 font-bold text-emerald-400">
                        Rp {Number(row.affiliate_commission_amount).toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          row.status === "PAID" 
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40" 
                            : "bg-amber-950/60 text-amber-400 border border-amber-800/40"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}