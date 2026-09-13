'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  Send,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Users,
  Building2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Radio,
  Sliders,
  Store,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

interface BroadcastLog {
  id: string;
  title: string;
  message: string;
  target: string;
  url: string;
  successCount: number;
  failureCount: number;
  timestamp: string;
}

export default function SuperAdminPushNotificationPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Form states
  const [title, setTitle] = useState('🚀 Pengumuman Fitur Baru BoonTrack');
  const [message, setMessage] = useState(
    'Halo Seller! Dashboard toko kini dilengkapi telemetri real-time dan notifikasi pesanan otomatis. Periksa sekarang!'
  );
  const [targetUrl, setTargetUrl] = useState('/dashboard');
  const [targetType, setTargetType] = useState<'all' | 'tier' | 'tenant'>('all');
  const [selectedTier, setSelectedTier] = useState<string>('solo');
  const [selectedTenant, setSelectedTenant] = useState<string>('ALL_SHOPS');

  // Tenant list for dropdown (strictly SaaS / storefront merchants)
  const [tenants, setTenants] = useState<{ slug: string; name: string; tier?: string }[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Sending state & feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<any | null>(null);
  const [historyLogs, setHistoryLogs] = useState<BroadcastLog[]>([]);

  // Authenticate PIN
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      sessionStorage.setItem('super_admin_auth', 'true');
      setIsAdminAuth(true);
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  // Load tenants from Supabase (Strictly isolate to SaaS / Shop Merchants)
  useEffect(() => {
    if (!isAdminAuth) return;
    const fetchTenants = async () => {
      setLoadingTenants(true);
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenants')
            .select('slug, name, tier, status, is_active, metadata')
            .order('name', { ascending: true });

          if (Array.isArray(data)) {
            // Filter strictly to SaaS / Storefront merchants:
            // 1. is_saas === true OR classification SaaS shop
            // 2. Exclude internal workspaces (holding, internal agency live, sandbox testing, dummy, expired)
            const saasMerchants = data.filter((t: any) => {
              if (t.is_active === false || t.status === 'expired' || t.status === 'inactive') return false;

              const meta = t.metadata || {};
              // Explicit flag from Supabase Single Source of Truth
              if (meta.is_saas === true) return true;
              if (meta.is_saas === false || meta.is_internal === true || meta.workspace_type === 'internal') return false;

              // Heuristic safety fallback for unmigrated rows
              const slug = (t.slug || '').toLowerCase();
              const name = (t.name || '').toLowerCase();
              if (
                slug.includes('holding') ||
                slug.includes('sandbox') ||
                slug.includes('dummy') ||
                slug.startsWith('test-') ||
                slug.includes('demo') ||
                slug.includes('career') ||
                slug.includes('loker') ||
                slug.includes('digicorn') ||
                slug.includes('bola') ||
                slug.includes('kurir') ||
                slug.includes('pelayanan-publik') ||
                name.includes('holding') ||
                name.includes('sandbox') ||
                name.includes('dummy') ||
                name.includes('demo store') ||
                name.includes('toko uji')
              ) {
                return false;
              }

              return true;
            });

            setTenants(saasMerchants);
            setSelectedTenant((prev) => prev || 'ALL_SHOPS');
          }
        }
      } catch (err) {
        console.warn('Gagal memuat tenant:', err);
      } finally {
        setLoadingTenants(false);
      }
    };
    fetchTenants();
  }, [isAdminAuth]);

  // Handle Send Broadcast
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      alert('Judul dan pesan tidak boleh kosong.');
      return;
    }

    setIsSubmitting(true);
    setDispatchResult(null);

    const targetValue =
      targetType === 'tenant' ? (selectedTenant || 'ALL_SHOPS') : targetType === 'tier' ? selectedTier : 'ALL_SHOPS';

    try {
      const res = await fetch('/api/v1/admin/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          url: targetUrl.trim() || '/dashboard',
          target_type: targetType,
          target_value: targetValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim push notification');
      }

      setDispatchResult(data);

      // Append to local history logs
      const newLog: BroadcastLog = {
        id: data.broadcast_id || `log-${Date.now()}`,
        title: title.trim(),
        message: message.trim(),
        target:
          targetType === 'all' || targetValue === 'ALL_SHOPS'
            ? 'Semua Toko Merchant (shop.boontrack.com)'
            : targetType === 'tier'
            ? `TIER: ${targetValue.toUpperCase()}`
            : `TOKO: ${targetValue}`,
        url: targetUrl.trim(),
        successCount: data.success_count || 0,
        failureCount: data.failure_count || 0,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setHistoryLogs((prev) => [newLog, ...prev]);
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Local Device Test Notification
  const handleLocalTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser ini tidak mendukung Web Notification');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification(title, {
            body: message,
            icon: '/logo.png',
            badge: '/logo.png',
            data: { url: targetUrl },
          } as any);
        } else {
          new Notification(title, {
            body: message,
            icon: '/logo.png',
          });
        }
        alert('Notifikasi uji coba berhasil ditembakkan ke browser Anda!');
      } else {
        alert('Izin notifikasi ditolak oleh browser.');
      }
    } catch (testErr) {
      console.error(testErr);
    }
  };

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl shadow-lg shadow-purple-500/10">
            🔔
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Superadmin Web Push Sender</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengakses Web Push Broadcaster. Masukkan PIN Master Super Admin.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base md:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-purple-600/30 cursor-pointer"
            >
              Buka Web Push Panel
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-purple-600 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Kembali ke Superadmin Cockpit"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Control Plane Broadcaster
                </span>
                <span className="text-[11px] text-slate-400">&bull; Web Push VAPID</span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Target: Merchant Storefront Aktif (shop.boontrack.com)
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Web Push Notification Broadcaster</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/shops"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition flex items-center gap-1.5"
            >
              <Store className="w-3.5 h-3.5 text-blue-400" />
              <span>Directory Shop</span>
            </Link>
            <Link
              href="/admin/telemetry"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition"
            >
              📊 Telemetri Trafik
            </Link>
            <Link
              href="/admin/economics"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition"
            >
              💰 Unit Economics
            </Link>
          </div>
        </div>

        {/* Form & Live Device Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Broadcast Form (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Formulir Pengiriman Pesan</h2>
                  <p className="text-[11px] text-slate-400">
                    Kirimkan pesan instan langsung ke layar HP & browser seller terdaftar.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4 text-xs font-medium text-slate-300">
              {/* Judul Notifikasi */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-200">Judul Notifikasi</label>
                  <span className="text-[10px] text-slate-500">{title.length}/60 karakter</span>
                </div>
                <input
                  type="text"
                  maxLength={60}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: 🔔 Pesanan Baru Masuk!"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                  required
                />
              </div>

              {/* Pesan Notifikasi */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-200">Pesan Notifikasi (Body)</label>
                  <span className="text-[10px] text-slate-500">{message.length}/200 karakter</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={200}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tulis pesan lengkap yang akan tampil di lockscreen perangkat seller..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                  required
                />
              </div>

              {/* Target Redirect URL */}
              <div>
                <label className="block mb-1.5 font-semibold text-slate-200">
                  Target Redirect URL (Saat Notifikasi Diklik)
                </label>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="/dashboard atau URL promosi"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              {/* Target Filter Options */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <label className="block font-bold text-slate-200">Filter Target Penerima</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('all')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetType === 'all'
                        ? 'bg-purple-600/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Semua Seller</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('tier')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetType === 'tier'
                        ? 'bg-purple-600/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Filter Tier</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetType('tenant')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetType === 'tenant'
                        ? 'bg-purple-600/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Toko Spesifik</span>
                  </button>
                </div>

                {/* Sub-selectors */}
                {targetType === 'tier' && (
                  <div className="pt-2">
                    <label className="block mb-1 text-[11px] text-slate-400">Pilih Tier Toko Target:</label>
                    <select
                      value={selectedTier}
                      onChange={(e) => setSelectedTier(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="solo">Solo / Starter</option>
                      <option value="team_scale">Team Scale / Pro Scale</option>
                      <option value="ads_performance">Ads Performance / Growth+</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                )}

                {targetType === 'tenant' && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-400">Pilih Toko Merchant:</label>
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        {tenants.length} Toko Merchant Terverifikasi
                      </span>
                    </div>
                    {loadingTenants ? (
                      <p className="text-xs text-slate-500">Memuat daftar toko...</p>
                    ) : (
                      <select
                        value={selectedTenant}
                        onChange={(e) => setSelectedTenant(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="ALL_SHOPS">📢 Semua Toko Merchant (shop.boontrack.com)</option>
                        {tenants.map((t) => (
                          <option key={t.slug} value={t.slug}>
                            {t.name} ({t.slug}) - {t.tier || 'Solo'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleLocalTestNotification}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition border border-slate-700 cursor-pointer"
                >
                  🧪 Test di Browser Saya
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/30 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menembakkan Web Push...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Kirim Web Push Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Broadcast Dispatch Result Alert */}
            {dispatchResult && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Push Broadcast Berhasil Diproses!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Total Target</span>
                    <span className="font-bold text-white text-sm">{dispatchResult.total_targets}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-emerald-400 block">Sukses Terkirim</span>
                    <span className="font-bold text-emerald-400 text-sm">{dispatchResult.success_count}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-rose-400 block">Gagal</span>
                    <span className="font-bold text-rose-400 text-sm">{dispatchResult.failure_count}</span>
                  </div>
                </div>
                {dispatchResult.note && (
                  <p className="text-[11px] text-slate-400 italic pt-1">{dispatchResult.note}</p>
                )}
              </div>
            )}
          </div>

          {/* Device Preview Card (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 pb-3 border-b border-slate-800">
                <Smartphone className="w-4 h-4 text-purple-400" />
                <span>Live Device Lockscreen Preview</span>
              </div>

              {/* Realistic Mobile Frame */}
              <div className="max-w-[300px] mx-auto bg-slate-950 rounded-3xl p-3 border-4 border-slate-800 shadow-2xl relative overflow-hidden">
                {/* Speaker pill notch */}
                <div className="w-24 h-3.5 bg-slate-800 rounded-full mx-auto mb-4" />

                {/* Lockscreen Time */}
                <div className="text-center space-y-0.5 mb-6">
                  <span className="text-2xl font-light text-slate-100 tracking-wider">
                    {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <p className="text-[9px] text-slate-400 font-medium">Minggu, 13 September</p>
                </div>

                {/* Push Notification Banner */}
                <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 border border-slate-700/60 shadow-lg space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-md bg-purple-600 flex items-center justify-center text-[9px] font-black text-white">
                        B
                      </div>
                      <span className="text-[10px] font-bold text-slate-200">BOONTRACK</span>
                    </div>
                    <span className="text-[9px] text-slate-500">Sekarang</span>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-white leading-tight truncate">
                      {title || 'Judul Notifikasi'}
                    </p>
                    <p className="text-[10px] text-slate-300 leading-snug line-clamp-3 mt-0.5">
                      {message || 'Pesan notifikasi preview di sini.'}
                    </p>
                  </div>

                  <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[9px] text-purple-400">
                    <span className="truncate">Klik untuk membuka: {targetUrl}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </div>
                </div>

                <div className="h-20" />
                {/* Home bar indicator */}
                <div className="w-28 h-1 bg-slate-700 rounded-full mx-auto mt-4" />
              </div>
            </div>

            {/* Quick Tips */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-[11px] text-slate-400 space-y-1.5">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <span>💡</span>
                <span>Pro-Tip Broadcaster:</span>
              </span>
              <p>
                Notifikasi dikirim melalui Web Push API terenkripsi. Perangkat seller yang sudah meng-install PWA
                akan menerima pesan ini meskipun browser sedang dalam keadaan ditutup.
              </p>
            </div>
          </div>
        </div>

        {/* History Broadcast Log Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white">Riwayat Pengiriman Web Push Terakhir</h3>
            <span className="text-[10px] text-slate-500">{historyLogs.length} pengiriman sesi ini</span>
          </div>

          {historyLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              Belum ada riwayat pengiriman push notification dalam sesi ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-950/80 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Judul & Pesan</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Hasil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {historyLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-850/50">
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{log.timestamp}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">{log.title}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-xs">{log.message}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700">
                          {log.target}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-purple-400 font-mono text-[11px]">{log.url}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{log.successCount} Sukses</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
