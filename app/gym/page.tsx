'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  ArrowUpRight,
  RefreshCw,
  CreditCard,
  DoorOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Sparkles,
  Activity,
} from 'lucide-react';
import {
  GymStats,
  AccessLog,
  GateController,
  getGymStats,
  getGateControllers,
  getGymAccessLogs,
} from '@/lib/gym-api';

export default function GymOverviewPage() {
  const [stats, setStats] = useState<GymStats | null>(null);
  const [controllers, setControllers] = useState<GateController[]>([]);
  const [recentLogs, setRecentLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickUid, setQuickUid] = useState('');
  const [scanResult, setScanResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  const loadData = useCallback(async () => {
    try {
      const [statsData, ctrlData, logsData] = await Promise.all([
        getGymStats('atmosfitnes'),
        getGateControllers('atmosfitnes'),
        getGymAccessLogs({ limit: 5 }, 'atmosfitnes'),
      ]);
      setStats(statsData);
      setControllers(ctrlData);
      setRecentLogs(logsData);
    } catch (error) {
      console.error('Error loading gym dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const [statsData, ctrlData, logsData] = await Promise.all([
          getGymStats('atmosfitnes'),
          getGateControllers('atmosfitnes'),
          getGymAccessLogs({ limit: 5 }, 'atmosfitnes'),
        ]);
        if (isMounted) {
          setStats(statsData);
          setControllers(ctrlData);
          setRecentLogs(logsData);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchInitial();

    const interval = setInterval(loadData, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSimulateQuickScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUid.trim()) return;

    const matchedLog = recentLogs.find((l) => l.card_uid.toLowerCase() === quickUid.toLowerCase());
    if (matchedLog) {
      setScanResult({
        status: matchedLog.decision === 'ALLOWED' ? 'success' : 'error',
        message: `Kartu [${quickUid.toUpperCase()}]: ${matchedLog.member_name} - ${matchedLog.reason}`,
      });
    } else {
      setScanResult({
        status: 'error',
        message: `Kartu [${quickUid.toUpperCase()}]: Tidak terdaftar / belum di-pairing ke member manapun.`,
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-800/80 p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Atmosfitnes Dashboard
            </span>
            <span className="text-xs text-slate-400">&bull; Live Hardware & Membership</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Selamat Datang di Gym Admin Hub
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitoring otomatisasi gate reader, tap NFC member, dan status controller secara real-time.
          </p>
        </div>

        <div className="flex items-center gap-2.5 z-10">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{refreshing ? 'Memperbarui...' : 'Refresh'}</span>
          </button>
          <Link
            href="/gym/members"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950 transition cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pairing Kartu NFC</span>
          </Link>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Members */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Active Member</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {loading ? (
                <div className="h-9 w-20 bg-slate-800 animate-pulse rounded" />
              ) : (
                stats?.active_members ?? 0
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" />
                Siap Tap Gate
              </span>
              <span>&bull;</span>
              <span>{stats?.total_members ?? 0} Terdaftar</span>
            </div>
          </div>
        </div>

        {/* Check-in Hari Ini (ALLOWED) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Check-in Hari Ini</span>
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-emerald-400 tracking-tight flex items-baseline gap-2">
              {loading ? (
                <div className="h-9 w-20 bg-slate-800 animate-pulse rounded" />
              ) : (
                <>
                  {stats?.today_allowed ?? 0}
                  <span className="text-xs font-normal text-slate-400">taps</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400/90">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-medium">Access Granted (ALLOWED)</span>
            </div>
          </div>
        </div>

        {/* Tap Gagal (DENIED) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tap Ditolak / Gagal</span>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-rose-400 tracking-tight flex items-baseline gap-2">
              {loading ? (
                <div className="h-9 w-20 bg-slate-800 animate-pulse rounded" />
              ) : (
                <>
                  {stats?.today_denied ?? 0}
                  <span className="text-xs font-normal text-slate-400">taps</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-rose-400/90">
              <XCircle className="w-3.5 h-3.5" />
              <span className="font-medium">Expired / Unknown Card</span>
            </div>
          </div>
        </div>

        {/* Status Gate (Online/Offline) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-cyan-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hardware Controllers</span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-cyan-400 tracking-tight flex items-baseline gap-1.5">
              {loading ? (
                <div className="h-9 w-20 bg-slate-800 animate-pulse rounded" />
              ) : (
                <>
                  {stats?.controllers_online ?? 0}
                  <span className="text-slate-500 text-xl font-bold">/</span>
                  <span className="text-slate-400 text-lg">{stats?.controllers_total ?? 0}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-medium">Semua Gate Aktif (MQTT/HTTP)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Real-time Tap Feed (5 latest) & Gate Status / Quick Scanner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-time Log Feed */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Live Gate Tap Feed</h2>
                  <p className="text-xs text-slate-400">5 riwayat tap gate controller terakhir</p>
                </div>
              </div>

              <Link
                href="/gym/access-logs"
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
              >
                Lihat Semua Audit Logs
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* List of 5 Logs */}
            <div className="divide-y divide-slate-800/80 mt-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="py-4 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-800" />
                      <div className="space-y-1.5">
                        <div className="h-4 w-32 bg-slate-800 rounded" />
                        <div className="h-3 w-48 bg-slate-800/60 rounded" />
                      </div>
                    </div>
                    <div className="h-6 w-20 bg-slate-800 rounded-full" />
                  </div>
                ))
              ) : recentLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Belum ada log tap gate terekam hari ini.
                </div>
              ) : (
                recentLogs.map((log) => {
                  const isAllowed = log.decision === 'ALLOWED';
                  const timeFormatted = new Date(log.tap_time).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={log.id}
                      className="py-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-xl transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isAllowed
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {isAllowed ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white truncate">{log.member_name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              UID: {log.card_uid}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            <span className="text-slate-300 font-medium">{log.controller_name}</span> &bull;{' '}
                            <span className={isAllowed ? 'text-slate-400' : 'text-rose-400 font-medium'}>
                              {log.reason}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isAllowed
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {log.decision}
                        </span>
                        <span className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {timeFormatted} WIB
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Sinyal Webhook Gate Terhubung
            </span>
            <span className="font-mono text-slate-300">Tenant: atmosfitnes</span>
          </div>
        </div>

        {/* Right Col: Quick NFC Card Checker & Controller Overview */}
        <div className="space-y-6">
          {/* Quick NFC UID Test Widget */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Kasir NFC Quick Test</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Uji coba UID kartu NFC yang di-tap pada reader USB kasir meja admin.
            </p>

            <form onSubmit={handleSimulateQuickScan} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Card UID (Hex / Serial)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={quickUid}
                    onChange={(e) => setQuickUid(e.target.value.toUpperCase())}
                    placeholder="Contoh: 04A2B89C31"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setQuickUid('04A2B89C31')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded hover:bg-slate-700"
                  >
                    Sample
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950"
              >
                <Search className="w-3.5 h-3.5" />
                Cek Validitas Kartu
              </button>
            </form>

            {scanResult.status !== 'idle' && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs border animate-in fade-in ${
                  scanResult.status === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {scanResult.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <p className="font-medium leading-relaxed">{scanResult.message}</p>
                </div>
              </div>
            )}
          </div>

          {/* Controller Quick Status */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">Hardware Gate Status</h3>
              </div>
              <Link
                href="/gym/controllers"
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
              >
                Kelola
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {controllers.map((ctrl) => (
                <div
                  key={ctrl.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{ctrl.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{ctrl.location}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
