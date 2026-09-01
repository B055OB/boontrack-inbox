"use client";

import React, { useState } from "react";
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  Search, 
  RotateCw, 
  Phone, 
  Receipt,
  Wallet,
  PiggyBank
} from "lucide-react";

// DUMMY DATA FOR TESTING (30% Budget Promosi: 25% Agensi Pool + 5% AM)
const DUMMY_AFFILIATES = [
  {
    code: "BOON-SUPER",
    name: "Suhu Ads",
    totalOrders: 18,
    grossSales: 8982000,
    affiliatePayout: 2694600, // 30%
    agencyPool: 2245500,      // 25% Agensi Pool
    managerPayout: 449100,    // 5% AM Override
  },
  {
    code: "SCALE-FAST",
    name: "Digital Champion",
    totalOrders: 9,
    grossSales: 4491000,
    affiliatePayout: 1347300, // 30%
    agencyPool: 1122750,      // 25% Agensi Pool
    managerPayout: 224550,    // 5% AM Override
  },
  {
    code: "GROWTH-HUB",
    name: "Media Booster",
    totalOrders: 4,
    grossSales: 1996000,
    affiliatePayout: 598800,  // 30%
    agencyPool: 499000,       // 25% Agensi Pool
    managerPayout: 99800,     // 5% AM Override
  }
];

const DUMMY_BUYER_ORDERS = [
  {
    id: "ORD-20260901-0812",
    createdAt: "2026-09-01 09:42",
    customerName: "Rizky Pratama",
    customerPhone: "081288991122",
    productName: "Step by Step Rahasia Dollar",
    grossAmount: 499000,
    affiliateCode: "BOON-SUPER",
    affiliateCut: 149700, // 30%
    agencyCut: 124750,    // 25%
    managerCut: 24950,    // 5%
    status: "PAID"
  },
  {
    id: "ORD-20260901-0735",
    createdAt: "2026-09-01 08:35",
    customerName: "Dewi Lestari",
    customerPhone: "085712345678",
    productName: "Masterclass Ads 2026",
    grossAmount: 99000,
    affiliateCode: "BOON-SUPER",
    affiliateCut: 29700,
    agencyCut: 24750,
    managerCut: 4950,
    status: "PAID"
  },
  {
    id: "ORD-20260901-0610",
    createdAt: "2026-09-01 07:10",
    customerName: "Ahmad Faisal",
    customerPhone: "087899887766",
    productName: "Step by Step Rahasia Dollar",
    grossAmount: 499000,
    affiliateCode: "SCALE-FAST",
    affiliateCut: 149700,
    agencyCut: 124750,
    managerCut: 24950,
    status: "PAID"
  },
  {
    id: "ORD-20260831-2315",
    createdAt: "2026-08-31 23:15",
    customerName: "Hendra Wijaya",
    customerPhone: "081377889900",
    productName: "Parfum Pheromone Missionary",
    grossAmount: 99000,
    affiliateCode: "GROWTH-HUB",
    affiliateCut: 29700,
    agencyCut: 24750,
    managerCut: 4950,
    status: "PAID"
  }
];

export default function ManagerControlCenter() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"orders" | "marketers">("orders");

  const totalGross = DUMMY_AFFILIATES.reduce((acc, curr) => acc + curr.grossSales, 0);
  const totalAgencyPool = DUMMY_AFFILIATES.reduce((acc, curr) => acc + curr.agencyPool, 0);
  const totalManagerEarned = DUMMY_AFFILIATES.reduce((acc, curr) => acc + curr.managerPayout, 0);
  const totalAffiliatePending = DUMMY_AFFILIATES.reduce((acc, curr) => acc + curr.affiliatePayout, 0);

  const filteredAffiliates = DUMMY_AFFILIATES.filter((a) =>
    a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOrders = DUMMY_BUYER_ORDERS.filter((o) =>
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerPhone.includes(searchTerm) ||
    o.affiliateCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-2">
              Agency Control Plane
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Affiliate Manager Control Center
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Budget Promosi 30% (25% Agensi Pool + 5% AM), Payout Affiliate (30%), dan Log Pesanan Real-time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => alert(`Memproses payout saldo AM sebesar Rp ${totalManagerEarned.toLocaleString("id-ID")}`)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2 text-xs font-bold transition shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>Tarik Saldo AM (5%)</span>
            </button>

            <button 
              onClick={() => window.location.reload()}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 flex items-center gap-2 text-xs font-semibold transition cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Total Gross Tim</span>
              <DollarSign className="w-4 h-4 text-slate-300" />
            </div>
            <div className="text-2xl font-black text-white">
              Rp {totalGross.toLocaleString("id-ID")}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-indigo-900/40 rounded-2xl p-5 space-y-2 bg-gradient-to-b from-slate-900/90 to-indigo-950/20">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-indigo-400">Agensi Pool Promosi (25%)</span>
              <PiggyBank className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-indigo-400">
              Rp {totalAgencyPool.toLocaleString("id-ID")}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-emerald-900/40 rounded-2xl p-5 space-y-2 bg-gradient-to-b from-slate-900/90 to-emerald-950/20">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-emerald-400">Saldo Payout AM (5%)</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">
              Rp {totalManagerEarned.toLocaleString("id-ID")}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Pending Payout Affiliate (30%)</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              Rp {totalAffiliatePending.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        {/* TAB & SEARCH BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-4 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer ${
                activeTab === "orders" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Data Transaksi & Buyer ({DUMMY_BUYER_ORDERS.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("marketers")}
              className={`px-4 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer ${
                activeTab === "marketers" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Alokasi Komisi Marketer & Promosi</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={activeTab === "orders" ? "Cari no invoice, nama, WA, ref..." : "Cari kode ref / nama marketer..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-80 bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* TAB 1: DATA TRANSAKSI & DETAIL SPLIT */}
        {activeTab === "orders" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Log Transaksi Masuk & Split Komisi</h3>
                <p className="text-[11px] text-slate-400">Rincian invoice, pembeli, atribusi affiliate (30%), agensi pool (25%), dan hak AM (5%).</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Waktu</th>
                    <th className="px-6 py-3.5">Invoice</th>
                    <th className="px-6 py-3.5">Data Buyer</th>
                    <th className="px-6 py-3.5">Gross Order</th>
                    <th className="px-6 py-3.5 text-amber-400">Affiliate (30%)</th>
                    <th className="px-6 py-3.5 text-indigo-400">Agensi Pool (25%)</th>
                    <th className="px-6 py-3.5 text-emerald-400">Hak AM (5%)</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                        {o.createdAt}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-white whitespace-nowrap">
                        {o.id}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-white">{o.customerName}</div>
                        <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {o.customerPhone}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-200 line-clamp-1">{o.productName}</div>
                        <div className="font-bold text-white">Rp {o.grossAmount.toLocaleString("id-ID")}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-amber-400">Rp {o.affiliateCut.toLocaleString("id-ID")}</div>
                        <span className="text-[10px] text-slate-400 font-mono">Ref: {o.affiliateCode}</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-indigo-400 whitespace-nowrap">
                        Rp {o.agencyCut.toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-400 whitespace-nowrap">
                        + Rp {o.managerCut.toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PERFORMA & PAYOUT MARKETER */}
        {activeTab === "marketers" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Daftar Marketer & Alokasi Budget Promosi</h3>
                <p className="text-[11px] text-slate-400">Rincian omzet, pencairan affiliate (30%), agensi pool (25%), dan komisi AM (5%).</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Kode Referral</th>
                    <th className="px-6 py-3.5">Nama Marketer</th>
                    <th className="px-6 py-3.5">Total Order</th>
                    <th className="px-6 py-3.5">Gross Penjualan</th>
                    <th className="px-6 py-3.5 text-amber-400">Payout Affiliate (30%)</th>
                    <th className="px-6 py-3.5 text-indigo-400">Agensi Pool (25%)</th>
                    <th className="px-6 py-3.5 text-emerald-400">Payout AM (5%)</th>
                    <th className="px-6 py-3.5 text-right">Aksi Affiliate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAffiliates.map((a) => (
                    <tr key={a.code} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4 font-mono font-bold text-blue-400">
                        {a.code}
                      </td>
                      <td className="px-6 py-4 text-white font-medium">
                        {a.name}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-200">
                        {a.totalOrders} order
                      </td>
                      <td className="px-6 py-4 font-bold text-white">
                        Rp {a.grossSales.toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 font-bold text-amber-400">
                        Rp {a.affiliatePayout.toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 font-bold text-indigo-400">
                        Rp {a.agencyPool.toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-400">
                        Rp {a.managerPayout.toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => alert(`Mencairkan payout affiliate ${a.name} (${a.code}) sebesar Rp ${a.affiliatePayout.toLocaleString("id-ID")}`)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition cursor-pointer"
                        >
                          Disburse Affiliate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}