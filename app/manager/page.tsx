"use client";

import React, { useState } from "react";
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
  ChevronRight
} from "lucide-react";

export default function ManagerPortalPage() {
  const [stats, setStats] = useState({
    totalAffiliates: 18,
    grossSales: 48900000,
    managerOverrideRevenue: 4890000, // 10% override
    pendingPayoutTotal: 3200000,
  });

  const [affiliates, setAffiliates] = useState([
    { id: "AFF-01", name: "Aldi R.", code: "ALDI01", salesCount: 42, grossAmount: 20958000, overrideEarned: 2095800, status: "Active" },
    { id: "AFF-02", name: "Suhu Ads Lead", code: "SUHUADS", salesCount: 28, grossAmount: 13972000, overrideEarned: 1397200, status: "Active" },
    { id: "AFF-03", name: "Budi Santoso", code: "BUDI99", salesCount: 15, grossAmount: 7485000, overrideEarned: 748500, status: "Active" },
    { id: "AFF-04", name: "Rina Kartika", code: "RINA_PRO", salesCount: 13, grossAmount: 6487000, overrideEarned: 648700, status: "Pending Review" },
  ]);

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
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer">
              <ShieldCheck className="w-4 h-4" /> Validasi Payout Batch
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-1">
            <span className="text-xs text-slate-400">Affiliate Terdaftar</span>
            <h3 className="text-xl font-black text-white">{stats.totalAffiliates} Akun</h3>
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
              <p className="text-xs text-slate-400">Rincian performa konversi masing-masing kode referral</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cari nama / kode ref..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-3 font-semibold">Marketer</th>
                  <th className="pb-3 font-semibold">Kode Referral</th>
                  <th className="pb-3 font-semibold">Total Order</th>
                  <th className="pb-3 font-semibold">Gross Sales</th>
                  <th className="pb-3 font-semibold">Override Anda (10%)</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {affiliates.map((aff) => (
                  <tr key={aff.id} className="text-slate-300">
                    <td className="py-3.5">
                      <div className="font-bold text-white">{aff.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{aff.id}</div>
                    </td>
                    <td className="py-3.5 font-mono text-indigo-400 font-semibold">{aff.code}</td>
                    <td className="py-3.5">{aff.salesCount} transaksi</td>
                    <td className="py-3.5">Rp {aff.grossAmount.toLocaleString("id-ID")}</td>
                    <td className="py-3.5 font-bold text-emerald-400">Rp {aff.overrideEarned.toLocaleString("id-ID")}</td>
                    <td className="py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        aff.status === "Active" 
                          ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40" 
                          : "bg-amber-950/60 text-amber-400 border border-amber-800/40"
                      }`}>
                        {aff.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <button className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}