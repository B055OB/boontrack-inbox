'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  ShoppingCart,
  RefreshCw,
  PieChart,
} from 'lucide-react';
import { GymReportData, getGymReports } from '@/lib/gym-api';

export default function GymReportsPage() {
  const [report, setReport] = useState<GymReportData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState('2026-08-21');
  const [endDate, setEndDate] = useState('2026-08-27');

  const loadReport = useCallback(async () => {
    try {
      const data = await getGymReports({ start_date: startDate, end_date: endDate }, 'atmosfitnes');
      setReport(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const data = await getGymReports({ start_date: '2026-08-21', end_date: '2026-08-27' }, 'atmosfitnes');
        if (isMounted) {
          setReport(data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRefreshing(true);
    loadReport();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Laporan Keuangan & Analytics
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              Omzet Konsolidasi
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Rekap pendapatan membership, penjualan POS cafe, dan rasio pemanfaatan fasilitas gym Atmosfitnes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              loadReport();
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <form
        onSubmit={handleFilterSubmit}
        className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-lg"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">Periode:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-500">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={refreshing}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-md shadow-emerald-950 cursor-pointer"
        >
          {refreshing ? 'Memfilter...' : 'Terapkan Filter'}
        </button>
      </form>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omzet */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Omzet Bersih</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white tracking-tight">
              Rp {report?.summary.total_revenue.toLocaleString('id-ID') ?? 0}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Membership + POS Kasir</span>
            </div>
          </div>
        </div>

        {/* Pendapatan Membership */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pendapatan Membership</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-purple-300 tracking-tight">
              Rp {report?.summary.membership_revenue.toLocaleString('id-ID') ?? 0}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
              <span>{report?.summary.active_members_count ?? 0} Member Aktif</span>
            </div>
          </div>
        </div>

        {/* Pendapatan POS Cafe */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pendapatan POS Cafe</span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-cyan-300 tracking-tight">
              Rp {report?.summary.pos_revenue.toLocaleString('id-ID') ?? 0}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
              <span>Minuman Cway & Snack</span>
            </div>
          </div>
        </div>

        {/* Total Transaksi */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Transaksi</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-amber-300 tracking-tight">
              {report?.summary.total_transactions ?? 0} Transaksi
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
              <span>Periode 7 Hari Terakhir</span>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown 1: Daily Revenue Trend Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-base text-white">Pendapatan Harian (Breakdown Membership vs POS)</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-3">Pendapatan Membership</th>
                <th className="py-2.5 px-3">Pendapatan POS Cway/Cafe</th>
                <th className="py-2.5 px-3">Total Omzet Harian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {report?.daily_revenue.map((row) => (
                <tr key={row.date} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3 font-sans font-medium text-slate-200">
                    {new Date(row.date).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3 px-3 text-purple-300">
                    Rp {row.membership_rev.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 text-cyan-300">
                    Rp {row.pos_rev.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 font-bold text-emerald-400">
                    Rp {row.total.toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breakdown 2 & 3: Top Packages & Facility Checkins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Packages */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <CreditCard className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-base text-white">Paket Membership Terlaris</h3>
          </div>

          <div className="space-y-3">
            {report?.top_packages.map((pkg) => (
              <div
                key={pkg.name}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-xs text-white">{pkg.name}</p>
                  <p className="text-[11px] text-slate-400">{pkg.count} Member Terdaftar</p>
                </div>
                <span className="font-mono font-bold text-xs text-emerald-400">
                  Rp {pkg.revenue.toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Facility Checkins */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <PieChart className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-base text-white">Distribusi Check-in per Fasilitas</h3>
          </div>

          <div className="space-y-4">
            {report?.facility_checkins.map((fac) => (
              <div key={fac.facility} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{fac.facility}</span>
                  <span className="font-mono text-slate-400">
                    {fac.checkin_count} taps ({fac.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
                    style={{ width: `${fac.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
