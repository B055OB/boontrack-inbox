'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  DoorOpen,
  Layers,
  Activity,
} from 'lucide-react';
import { AccessLog, getGymAccessLogs, GateController, getGateControllers } from '@/lib/gym-api';

export default function GymAccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [controllers, setControllers] = useState<GateController[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('ALL');
  const [controllerFilter, setControllerFilter] = useState('ALL');

  const loadLogs = useCallback(async () => {
    try {
      const [logsData, ctrlData] = await Promise.all([
        getGymAccessLogs(
          {
            limit: 50,
            decision: decisionFilter,
            controller: controllerFilter,
          },
          'atmosfitnes'
        ),
        getGateControllers('atmosfitnes'),
      ]);
      setLogs(logsData);
      setControllers(ctrlData);
    } catch (error) {
      console.error('Failed to load access logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [decisionFilter, controllerFilter]);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const [logsData, ctrlData] = await Promise.all([
          getGymAccessLogs(
            {
              limit: 50,
              decision: decisionFilter,
              controller: controllerFilter,
            },
            'atmosfitnes'
          ),
          getGateControllers('atmosfitnes'),
        ]);
        if (isMounted) {
          setLogs(logsData);
          setControllers(ctrlData);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchInitial();

    return () => {
      isMounted = false;
    };
  }, [decisionFilter, controllerFilter]);

  // Auto refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.member_name.toLowerCase().includes(q) ||
      log.card_uid.toLowerCase().includes(q) ||
      log.controller_name.toLowerCase().includes(q) ||
      log.reason.toLowerCase().includes(q)
    );
  });

  const totalAllowed = filteredLogs.filter((l) => l.decision === 'ALLOWED').length;
  const totalDenied = filteredLogs.filter((l) => l.decision === 'DENIED').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Gate Audit Access Logs</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5">
              <Activity className="w-3 h-3 animate-pulse" />
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Rekam jejak setiap tap kartu NFC member pada turnstile gate & pintu studio Atmosfitnes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            <span>Auto Refresh (5s)</span>
          </button>

          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Quick Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Total Tap Terekam</p>
            <p className="text-2xl font-bold text-white mt-1">{filteredLogs.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Tap Disetujui (ALLOWED)</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{totalAllowed}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Tap Ditolak (DENIED)</p>
            <p className="text-2xl font-bold text-rose-400 mt-1">{totalDenied}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama member, card UID, alasan ditolak..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
          />
        </div>

        {/* Decision Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {['ALL', 'ALLOWED', 'DENIED'].map((dec) => (
              <button
                key={dec}
                onClick={() => setDecisionFilter(dec)}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  decisionFilter === dec
                    ? dec === 'DENIED'
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dec === 'ALL' ? 'Semua' : dec}
              </button>
            ))}
          </div>

          {/* Controller Filter */}
          <select
            value={controllerFilter}
            onChange={(e) => setControllerFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Semua Gate</option>
            {controllers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Waktu Tap</th>
                <th className="py-3.5 px-4">Member / Pemilik Kartu</th>
                <th className="py-3.5 px-4">Gate Controller</th>
                <th className="py-3.5 px-4">Keputusan</th>
                <th className="py-3.5 px-4">Alasan / Detail Log</th>
                <th className="py-3.5 px-4">Card UID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="py-4 px-4 font-sans">
                      <div className="h-4 bg-slate-800 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm font-sans">
                    Tidak ada audit logs yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isAllowed = log.decision === 'ALLOWED';
                  const dateObj = new Date(log.tap_time);
                  const timeFormatted = dateObj.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const dateFormatted = dateObj.toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4">
                        <div className="font-sans">
                          <p className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {timeFormatted} WIB
                          </p>
                          <p className="text-[10px] text-slate-400">{dateFormatted}</p>
                        </div>
                      </td>

                      {/* Member */}
                      <td className="py-3.5 px-4">
                        <div className="font-sans">
                          <p className="font-bold text-white text-xs">{log.member_name}</p>
                          {log.member_id && (
                            <p className="text-[10px] text-slate-400 font-mono">ID: {log.member_id}</p>
                          )}
                        </div>
                      </td>

                      {/* Gate Controller */}
                      <td className="py-3.5 px-4">
                        <div className="font-sans">
                          <p className="font-medium text-slate-200 text-xs flex items-center gap-1">
                            <DoorOpen className="w-3 h-3 text-cyan-400" />
                            {log.controller_name}
                          </p>
                          <p className="text-[10px] text-slate-400">{log.gate_location}</p>
                        </div>
                      </td>

                      {/* Decision */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border font-sans ${
                            isAllowed
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isAllowed ? (
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <ShieldAlert className="w-3 h-3 text-rose-400" />
                          )}
                          {log.decision}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 font-sans">
                        <p className={`text-xs ${isAllowed ? 'text-slate-300' : 'text-rose-300 font-medium'}`}>
                          {log.reason}
                        </p>
                      </td>

                      {/* Card UID */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                          {log.card_uid}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
