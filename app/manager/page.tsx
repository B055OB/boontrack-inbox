"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  ShieldCheck, 
  Search, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { getSupabase } from "@/lib/supabaseClient";

interface AffiliateSummary {
  code: string;
  salesCount: number;
  grossAmount: number;
  overrideEarned: number;
  status: string;
}

export default function ManagerPortalPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalAffiliates: 0,
    grossSales: 0,
    managerOverrideRevenue: 0,
    pendingPayoutTotal: 0,
  });

  const [affiliateList, setAffiliateList] = useState<AffiliateSummary[]>([]);

  const fetchManagerData = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data: rows, error } = await supabase
        .table("commission_ledger")
        .select("*")
        .order("created_at", { ascending: false });

      if (rows && !error) {
        const totalGross = rows.reduce((sum: number, r: any) => sum + Number(r.gross_amount || 0), 0);
        const totalOverride = rows.reduce((sum: number, r: any) => sum + Number(r.manager_override_amount || 0), 0);
        const pendingPayout = rows
          .filter((r: any) => r.status === "PENDING_PAYOUT")
          .reduce((sum: number, r: any) => sum + Number(r.affiliate_commission_amount || 0), 0);

        const groupedMap = new Map<string, { count: number; gross: number; override: number }>();

        rows.forEach((r: any) => {
          const code = (r.affiliate_code || "DEFAULT").toUpperCase();
          const curr = groupedMap.get(code) || { count: 0, gross: 0, override: 0 };
          groupedMap.set(code, {
            count: curr.count + 1,
            gross: curr.gross + Number(r.gross_amount || 0),
            override: curr.override + Number(r.manager_override_amount || 0),
          });
        });

        const formattedList: AffiliateSummary[] = Array.from(groupedMap.entries()).map(([code, val]) => ({
          code,
          salesCount: val.count,
          grossAmount: val.gross,
          overrideEarned: val.override,
          status: "Active",
        }));

        setStats({
          totalAffiliates: formattedList.length,
          grossSales: totalGross,
          managerOverrideRevenue: totalOverride,
          pendingPayoutTotal: pendingPayout,
        });

        setAffiliateList(formattedList);
      }
    } catch (err) {
      console.error("Failed to fetch manager data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagerData();
  }, []);

  const filteredAffiliates = affiliateList.filter((a) =>
    a.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header Portal */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase">
                Agency Control Plane
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">Affiliate Manager Control Center</h1>
            <p className="text-xs text-slate-400">Monitoring tim marketer, komisi override agensi, dan validasi payout.</p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={fetchManagerData} 
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer">
              <ShieldCheck className="w-4 h-4" /> Validasi Payout Batch
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Affiliate Aktif</span>
            <h3 className="text-xl font-black text-white">{stats.totalAffiliates} Marketer</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Gross Penjualan Tim</span>
            <h3 className="text-xl font-black text-white">Rp {stats.grossSales.toLocaleString("id-ID")}</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Override Revenue (Agensi)</span>
            <h3 className="text-xl font-black text-indigo-400">Rp {stats.managerOverrideRevenue.toLocaleString("id-ID")}</h3>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Menunggu Approval Payout</span>
            <h3 className="text-xl font-black text-amber-400">Rp {stats.pendingPayoutTotal.toLocaleString("id-ID")}</h3>
          </div>
        </div>

        {/* Tabel Marketer Binaan */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Daftar Affiliate & Performa Penjualan</h2>
              <p className="text-xs text-slate-400">Rincian performa konversi masing-masing kode referral (Live Sync)</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari kode ref..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-3 font-semibold">Kode Referral</th>
                  <th className="pb-3 font-semibold">Total Order</th>
                  <th className="pb-3 font-semibold">Gross Sales</th>
                  <th className="pb-3 font-semibold">Override Anda (10%)</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAffiliates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      {loading ? "Memuat data affiliate..." : "Belum ada data marketer ditemukan."}
                    </td>
                  </tr>
                ) : (
                  filteredAffiliates.map((aff, idx) => (
                    <tr key={idx} className="text-slate-300">
                      <td className="py-3.5 font-mono text-indigo-400 font-bold">{aff.code}</td>
                      <td className="py-3.5">{aff.salesCount} transaksi</td>
                      <td className="py-3.5">Rp {aff.grossAmount.toLocaleString("id-ID")}</td>
                      <td className="py-3.5 font-bold text-emerald-400">Rp {aff.overrideEarned.toLocaleString("id-ID")}</td>
                      <td className="py-3.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                          {aff.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <button className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
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