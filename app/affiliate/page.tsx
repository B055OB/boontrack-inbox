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
  CheckCircle2 
} from "lucide-react";

export default function AffiliatePortalPage() {
  const [copied, setCopied] = useState(false);
  const [affiliateCode, setAffiliateCode] = useState("BOON-SUPER");
  const [stats, setStats] = useState({
    totalEarnings: 1450000,
    pendingPayout: 450000,
    totalReferrals: 28,
    conversionRate: "14.2%"
  });

  const referralLink = `https://shop.boontrack.com/suhuads?ref=${affiliateCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sampleLedger = [
    { id: "ORD-9821", date: "2026-08-31", product: "Step by Step Dollar Paid Traffic", amount: 499000, commission: 150000, status: "PAID" },
    { id: "ORD-9810", date: "2026-08-30", product: "Masterclass Ads 2026", amount: 99000, commission: 30000, status: "PAID" },
    { id: "ORD-9788", date: "2026-08-28", product: "Parfum Pheromone Missionary", amount: 99000, commission: 25000, status: "PENDING_PAYOUT" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
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
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs px-4 py-3 rounded-xl font-mono focus:outline-none"
            />
            <button
              onClick={copyToClipboard}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
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
            <span className="text-xs text-slate-400">Total Pembeli (Lead)</span>
            <h3 className="text-xl font-black text-white">{stats.totalReferrals} User</h3>
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
            <span className="text-xs text-slate-500">Real-time sync</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-3 font-semibold">Order ID</th>
                  <th className="pb-3 font-semibold">Tanggal</th>
                  <th className="pb-3 font-semibold">Produk</th>
                  <th className="pb-3 font-semibold">Nominal Order</th>
                  <th className="pb-3 font-semibold">Komisi Anda</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sampleLedger.map((row) => (
                  <tr key={row.id} className="text-slate-300">
                    <td className="py-3.5 font-mono text-slate-400">{row.id}</td>
                    <td className="py-3.5">{row.date}</td>
                    <td className="py-3.5 font-medium text-white">{row.product}</td>
                    <td className="py-3.5">Rp {row.amount.toLocaleString("id-ID")}</td>
                    <td className="py-3.5 font-bold text-emerald-400">Rp {row.commission.toLocaleString("id-ID")}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}