'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Unlock,
  Lock,
  RefreshCw,
  Clock,
  Zap,
  Activity,
  CheckCircle2,
  Server,
  Terminal,
  Shield,
  Layers,
  Wifi,
} from 'lucide-react';
import { GateController, getGateControllers, triggerGateUnlock } from '@/lib/gym-api';

export default function GateControllersPage() {
  const [controllers, setControllers] = useState<GateController[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{ id: string; message: string; type: 'success' | 'info' } | null>(null);

  const loadControllers = useCallback(async () => {
    try {
      const data = await getGateControllers('atmosfitnes');
      setControllers(data);
    } catch (error) {
      console.error('Failed to load gate controllers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const data = await getGateControllers('atmosfitnes');
        if (isMounted) {
          setControllers(data);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchInitial();

    const interval = setInterval(loadControllers, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadControllers]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadControllers();
  };

  const handleTriggerUnlock = async (controller: GateController) => {
    setUnlockingId(controller.id);
    setActionAlert(null);

    const res = await triggerGateUnlock(controller.id, 'atmosfitnes');

    // Temporarily set controller relay state to UNLOCKED in UI
    setControllers((prev) =>
      prev.map((c) => (c.id === controller.id ? { ...c, relay_state: 'UNLOCKED' } : c))
    );

    setActionAlert({
      id: controller.id,
      message: res.message,
      type: 'success',
    });

    // Auto lock back after 4 seconds
    setTimeout(() => {
      setControllers((prev) =>
        prev.map((c) => (c.id === controller.id ? { ...c, relay_state: 'LOCKED' } : c))
      );
      setUnlockingId(null);
    }, 4000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Hardware Gate Controllers</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              ESP32 RFID Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Status heartbeat komunikasi hardware, relay lock/unlock test, dan telemetri perangkat turnstile gate.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{refreshing ? 'Memeriksa...' : 'Ping Heartbeat'}</span>
          </button>
        </div>
      </div>

      {/* Controller Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 animate-pulse space-y-4">
                <div className="h-6 bg-slate-800 rounded w-1/2" />
                <div className="h-4 bg-slate-800/60 rounded w-3/4" />
                <div className="h-24 bg-slate-800/40 rounded" />
              </div>
            ))
          : controllers.map((ctrl) => {
              const isOnline = ctrl.status === 'online';
              const isUnlocked = ctrl.relay_state === 'UNLOCKED';
              const isUnlockingThis = unlockingId === ctrl.id;

              return (
                <div
                  key={ctrl.id}
                  className={`bg-slate-900/90 border rounded-2xl p-6 shadow-xl transition relative overflow-hidden flex flex-col justify-between ${
                    isUnlocked
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : isOnline
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-rose-900/50'
                  }`}
                >
                  {/* Top Status & Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-white tracking-tight">{ctrl.name}</h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{ctrl.location}</p>
                      </div>

                      {/* Online Pulse Badge */}
                      <span
                        className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border ${
                          isOnline
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}
                        />
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    {/* Relay Visual Indicator Box */}
                    <div
                      className={`p-4 rounded-xl border mb-5 transition-all ${
                        isUnlocked
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isUnlocked ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 uppercase font-semibold">Relay Status</p>
                            <p className="text-sm font-bold tracking-wide">
                              {isUnlocked ? 'UNLOCKED (PINTU TERBUKA)' : 'LOCKED (TERKUNCI)'}
                            </p>
                          </div>
                        </div>

                        {isUnlocked && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-400 text-slate-950 animate-pulse uppercase">
                            Open Pulse
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Telemetry Details */}
                    <div className="space-y-2 text-xs border-t border-slate-800/80 pt-4 mb-5">
                      <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-slate-500" />
                          Kode Gate:
                        </span>
                        <span className="font-mono text-slate-200 font-semibold">{ctrl.code}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-500" />
                          Tipe Barrier:
                        </span>
                        <span className="text-slate-200">{ctrl.type}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Wifi className="w-3.5 h-3.5 text-slate-500" />
                          IP Address:
                        </span>
                        <span className="font-mono text-cyan-400">{ctrl.ip_address}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-slate-500" />
                          MAC Hardware:
                        </span>
                        <span className="font-mono text-slate-400 text-[11px]">{ctrl.mac_address}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-slate-500" />
                          Firmware:
                        </span>
                        <span className="font-mono text-slate-400 text-[11px]">{ctrl.firmware_version}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-slate-500" />
                          Total Tap Hari Ini:
                        </span>
                        <span className="font-bold text-emerald-400">{ctrl.total_taps_today} taps</span>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-slate-800/50 text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Heartbeat Terakhir:
                        </span>
                        <span className="text-slate-300 font-mono">
                          {new Date(ctrl.last_seen_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}{' '}
                          WIB
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button & Feedback */}
                  <div>
                    {actionAlert && actionAlert.id === ctrl.id && (
                      <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span className="font-medium text-[11px] leading-tight">{actionAlert.message}</span>
                      </div>
                    )}

                    <button
                      onClick={() => handleTriggerUnlock(ctrl)}
                      disabled={isUnlockingThis || !isOnline}
                      className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                        isUnlocked
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950'
                      } ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isUnlocked ? (
                        <>
                          <Unlock className="w-4 h-4" />
                          <span>Pintu Sedang Dibuka (4s)</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          <span>Test Buka Pintu (Unlock Relay)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Hardware Architecture Banner */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white">Standar Keamanan Gate Offline & Online</h4>
            <p className="text-xs text-slate-400">
              ESP32 Gate Controller mendukung cache lokal UID kartu aktif sehingga turnstile tetap dapat membuka pintu
              meskipun koneksi internet gym sedang terputus (Offline Resilient).
            </p>
          </div>
        </div>

        <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 shrink-0">
          MQTT: <span className="text-emerald-400">iot.boontrack.com:8883 (TLS)</span>
        </div>
      </div>
    </div>
  );
}
