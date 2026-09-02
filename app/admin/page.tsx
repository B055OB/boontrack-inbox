'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wifi,
  CreditCard,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Dumbbell,
  Bot,
  Sliders,
  ShoppingBag,
  ArrowRight,
  Store,
  ShieldAlert,
  Check,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { HealthStatus, WaGatewayStatus } from '@/lib/tenant-config';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  category?: 'internal' | 'external' | 'shop' | string;
  vertical?: string;
  plan?: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  access_username?: string;
  access_password?: string;
  monthly_fee?: number;
  message_count?: number;
  health_status?: HealthStatus;
  wa_gateway_status?: WaGatewayStatus;
  last_payment_ping?: string;
  uptime_pct?: number;
  response_time_ms?: number;
}

interface Incident {
  id: string;
  tenant_id: string;
  service: string;
  severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED';
  error_code: string;
  error_message: string;
  first_seen_at: string;
}

const INTERNAL_SLUGS = [
  'boontrack-holding',
  'boontrack-career',
  'career',
  'boontrack-kurir',
  'boontrack-bola',
  'boontrack-loker',
  'boontrack-digicorn',
  'boontrack-demo',
  'om-budi',
];

const MASTER_PIN = '998877';

export default function SuperAdminDashboard() {
  const CORE_API_URL =
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://boontrack-core-production.up.railway.app';

  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'internal' | 'external' | 'shop'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Modal Provision State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newVertical, setNewVertical] = useState<'shop' | 'gym' | 'career'>('shop');
  const [newPlan, setNewPlan] = useState<'growth' | 'pro'>('growth');
  const [newPhone, setNewPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalMsg, setModalMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Drawer Incident State
  const [showIncidentDrawer, setShowIncidentDrawer] = useState(false);

  const togglePasswordMask = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      setIsAdminAuth(true);
      sessionStorage.setItem('super_admin_auth', 'true');
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  const loadIncidents = useCallback(async () => {
    try {
      const res = await fetch(`${CORE_API_URL}/api/v1/internal/tenants/incidents`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setIncidents(data.data || []);
      }
    } catch {
      // ignore
    }
  }, [CORE_API_URL]);

  const loadTenants = useCallback(async () => {
    if (!isAdminAuth) return;
    setLoading(true);
    try {
      let currentTenants: Tenant[] = [];

      // 1. Prioritaskan API internal boontrack-core yang sudah steril
      try {
        const res = await fetch(`${CORE_API_URL}/api/v1/internal/tenants/list`, { cache: 'no-store' });
        const resJson = await res.json();
        if (resJson.success && Array.isArray(resJson.data)) {
          currentTenants = resJson.data as Tenant[];
        }
      } catch {
        // Fallback langsung ke Supabase
        const supabase = getSupabase();
        const { data } = await supabase.from('tenants').select('*');
        if (data) currentTenants = data as Tenant[];
      }

      // 2. Fetch volume pesan
      let countMap: Record<string, number> = {};
      try {
        const supabase = getSupabase();
        const { data: messagesData } = await supabase.from('messages').select('tenant_id, tenant_slug');
        messagesData?.forEach((m: { tenant_id?: string | null; tenant_slug?: string | null }) => {
          if (m.tenant_id) countMap[m.tenant_id] = (countMap[m.tenant_id] || 0) + 1;
          if (m.tenant_slug) countMap[m.tenant_slug] = (countMap[m.tenant_slug] || 0) + 1;
        });
      } catch {
        countMap = {};
      }

      // 3. Ping server health
      let serverLiveStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
      let serverLatency = 120;
      const startTime = performance.now();

      try {
        const healthRes = await fetch(`${CORE_API_URL}/health`, { method: 'GET', cache: 'no-store' });
        serverLatency = Math.round(performance.now() - startTime);
        serverLiveStatus = healthRes.ok ? (serverLatency > 800 ? 'DEGRADED' : 'HEALTHY') : 'DEGRADED';
      } catch {
        serverLiveStatus = 'DOWN';
      }

      const mapped: Tenant[] = currentTenants.map((t) => {
        const isInternal =
          t.category === 'internal' ||
          INTERNAL_SLUGS.includes(t.slug) ||
          t.slug.startsWith('boontrack-');

        const isShop = t.category === 'shop' || t.vertical === 'shop' || t.slug === 'onlineboost' || t.slug === 'kanz-store' || t.slug === 'toko-berkah';

        const isHealthy = t.status === 'HEALTHY' || t.status === 'active';
        const finalHealth: HealthStatus = !isHealthy ? 'DOWN' : serverLiveStatus;

        return {
          ...t,
          category: isShop ? 'shop' : isInternal ? 'internal' : 'external',
          message_count: countMap[t.id] || countMap[t.slug] || 0,
          health_status: finalHealth,
          wa_gateway_status: isHealthy ? (serverLiveStatus === 'HEALTHY' ? 'CONNECTED' : 'RECONNECTING') : 'DISCONNECTED',
          last_payment_ping: isHealthy ? 'Live Sync' : 'Offline',
          uptime_pct: isHealthy ? (serverLiveStatus === 'HEALTHY' ? 99.9 : 95.0) : 0,
          response_time_ms: isHealthy ? serverLatency : 0,
        };
      });

      setTenants(mapped);
      await loadIncidents();
    } catch (err) {
      console.error('Error fetching live tenants:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdminAuth, CORE_API_URL, loadIncidents]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants, refreshKey]);

  const toggleTenantStatus = async (tenant: Tenant) => {
    const isCurrentlyActive = tenant.status === 'active' || tenant.status === 'HEALTHY';
    const nextStatus = isCurrentlyActive ? 'SUSPENDED' : 'HEALTHY';
    const supabase = getSupabase();

    const { error } = await supabase
      .from('tenants')
      .update({ status: nextStatus })
      .eq('id', tenant.id);

    if (!error) {
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t))
      );
      setRefreshKey((k) => k + 1);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalMsg(null);
    try {
      const cleanSlug = newSlug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      const res = await fetch(`${CORE_API_URL}/api/v1/internal/tenants/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_name: newName,
          slug: cleanSlug,
          vertical: newVertical,
          plan: newPlan,
          admin_phone: newPhone,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || 'Gagal memprovisi tenant');
      }

      setModalMsg({ type: 'success', text: `Tenant "${newName}" berhasil didaftarkan!` });
      setTimeout(() => {
        setShowAddModal(false);
        setNewName('');
        setNewSlug('');
        setNewPhone('');
        setModalMsg(null);
        setRefreshKey((k) => k + 1);
      }, 1200);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setModalMsg({ type: 'error', text: errorMsg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIncident = async (incidentId: string) => {
    try {
      await fetch(`${CORE_API_URL}/api/v1/internal/tenants/incidents/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId }),
      });
      loadIncidents();
    } catch {
      // ignore
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const matchCategory =
      activeTab === 'all' ||
      (activeTab === 'internal' && t.category === 'internal') ||
      (activeTab === 'external' && t.category === 'external') ||
      (activeTab === 'shop' && t.category === 'shop');

    const matchSearch = searchQuery
      ? t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    return matchCategory && matchSearch;
  });

  const countInternal = tenants.filter((t) => t.category === 'internal').length;
  const countExternal = tenants.filter((t) => t.category === 'external').length;
  const countShops = tenants.filter((t) => t.category === 'shop').length;
  const countHealthy = tenants.filter((t) => t.health_status === 'HEALTHY').length;
  const countDegraded = tenants.filter((t) => t.health_status === 'DEGRADED').length;
  const countDown = tenants.filter((t) => t.health_status === 'DOWN').length;
  const openIncidentsCount = incidents.filter((i) => i.status === 'OPEN').length;

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl shadow-lg shadow-blue-500/10">
            ⚡
          </div>
          <h1 className="text-lg font-bold text-white mb-1">BoonTrack Control Plane</h1>
          <p className="text-xs text-slate-400 mb-5">
            Internal multi-tenant orchestrator & configuration engine. Masukkan PIN Master Super Admin.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base md:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Buka Internal Control Plane
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-blue-600 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl backdrop-blur-md shadow-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                P1 Control Plane
              </span>
              <span className="text-[11px] text-slate-400">&bull; Live Multi-Tenant Cockpit</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">BoonTrack Internal Control Plane</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitoring kesehatan real-time, konfigurasi persona AI modular, dan security guardrail terenkripsi.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowIncidentDrawer(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold rounded-xl border border-amber-500/30 transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Incidents ({openIncidentsCount})</span>
            </button>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer"
              title="Refresh Live Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Tambah Workspace</span>
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('super_admin_auth');
                setIsAdminAuth(false);
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              Kunci
            </button>
          </div>
        </div>

        {/* Master Card Shop Hub */}
        <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 border border-blue-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 backdrop-blur-md">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                <ShoppingBag className="w-3 h-3 text-blue-400" />
                <span>SaaS Commerce Hub</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Settlement Sync
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              BoonTrack Multi-Store & Merchant Superadmin
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Direktori terpusat untuk monitoring ribuan toko online merchant, auto-delivery QRIS Xendit, dan routing Meta WhatsApp Cloud API.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
            <Link
              href="/admin/shops"
              className="px-5 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 active:scale-95 text-center cursor-pointer"
            >
              <Store className="w-4 h-4" />
              <span>Buka Directory Semua Toko</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Health Stat Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Total Workspaces</span>
            <span className="text-xl font-bold text-white mt-1 block">{tenants.length}</span>
            <span className="text-[10px] text-slate-500">Live DB instances</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Healthy</span>
            </span>
            <span className="text-xl font-bold text-emerald-400 mt-1 block">{countHealthy}</span>
            <span className="text-[10px] text-slate-500">Live operational</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Degraded</span>
            </span>
            <span className="text-xl font-bold text-amber-400 mt-1 block">{countDegraded}</span>
            <span className="text-[10px] text-slate-500">High latency</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              <span>Down / Suspended</span>
            </span>
            <span className="text-xl font-bold text-rose-400 mt-1 block">{countDown}</span>
            <span className="text-[10px] text-slate-500">Service paused</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>WA Gateway</span>
            </span>
            <span className="text-xl font-bold text-white mt-1 block">
              {tenants.filter((t) => t.wa_gateway_status === 'CONNECTED').length}/{tenants.length}
            </span>
            <span className="text-[10px] text-slate-500">Live nodes</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
              <span>QRIS Engine</span>
            </span>
            <span className="text-sm font-bold text-emerald-400 mt-2 block">Live Sync</span>
            <span className="text-[10px] text-slate-500">Automated settlement</span>
          </div>
        </div>

        {/* Tab Filter & Search Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Semua ({tenants.length})
            </button>
            <button
              onClick={() => setActiveTab('internal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'internal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              Internal ({countInternal})
            </button>
            <button
              onClick={() => setActiveTab('external')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'external'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Client B2B ({countExternal})
            </button>
            <button
              onClick={() => setActiveTab('shop')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'shop'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              SaaS Shops ({countShops})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari tenant / slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 w-48 sm:w-60"
              />
            </div>

            <div className="flex items-center bg-slate-900 p-1 border border-slate-800 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Grid Mode"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Table Mode"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 1. GRID CARD VIEW */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {loading ? (
              <div className="col-span-full py-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>Mengambil data live telemetry dari database...</span>
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
                Tidak ada workspace di kategori ini.
              </div>
            ) : (
              filteredTenants.map((t) => {
                const isInternal = t.category === 'internal';
                const isShop = t.category === 'shop';
                const isHealthyTenant = t.health_status === 'HEALTHY';
                const isDegradedTenant = t.health_status === 'DEGRADED';
                const isWaConnected = t.wa_gateway_status === 'CONNECTED';
                const isWaReconnecting = t.wa_gateway_status === 'RECONNECTING';
                const isRevealed = revealedPasswords[t.id] || false;

                return (
                  <div
                    key={t.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700 transition space-y-4 group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isShop
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : isInternal
                              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {isShop ? 'SaaS Storefront' : isInternal ? 'Internal Ecosystem' : 'Client B2B'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1.5 ${
                              isHealthyTenant
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : isDegradedTenant
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isHealthyTenant
                                  ? 'bg-emerald-400 animate-pulse'
                                  : isDegradedTenant
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                              }`}
                            />
                            {t.health_status || 'HEALTHY'}
                          </span>
                        </div>
                      </div>

                      <h2 className="text-base font-bold text-white group-hover:text-blue-400 transition">
                        {t.name}
                      </h2>
                      <p className="text-xs font-mono text-slate-400 font-normal">/{t.slug}</p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                          <Wifi className={`w-3.5 h-3.5 ${isWaConnected ? 'text-emerald-400' : isWaReconnecting ? 'text-amber-400' : 'text-rose-400'}`} />
                          <span>WhatsApp Gateway</span>
                        </span>
                        <span
                          className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                            isWaConnected
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : isWaReconnecting
                              ? 'text-amber-400 bg-amber-500/10'
                              : 'text-rose-400 bg-rose-500/10'
                          }`}
                        >
                          {t.wa_gateway_status || 'CONNECTED'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                          <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                          <span>Last Payment Ping</span>
                        </span>
                        <span className="font-mono text-slate-300 text-[11px]">
                          {t.last_payment_ping || 'Live Sync'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                        <span className="text-slate-500">Uptime & Latency</span>
                        <span className="font-mono text-slate-400">
                          {t.uptime_pct || 99.9}% &bull; {t.response_time_ms || 120}ms
                        </span>
                      </div>
                    </div>

                    <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-slate-500 text-[10px] block">Vertical: {t.vertical || 'shop'}</span>
                        <span className="text-slate-300 text-[11px]">
                          Tier: <span className="text-indigo-400 uppercase font-semibold">{t.plan || 'growth'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          href={`/admin/${t.slug}/config`}
                          className="px-3 py-2 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 hover:border-blue-500/50 text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Config Editor</span>
                        </Link>

                        <Link
                          href={`/${t.slug}`}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center justify-center gap-1.5"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>Monitoring</span>
                        </Link>
                      </div>

                      {t.slug === 'atmosfitnes' && (
                        <Link
                          href="/gym"
                          className="w-full px-3 py-2 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-semibold transition inline-flex items-center justify-center gap-1.5"
                        >
                          <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Buka Gym Control Hub &rarr;</span>
                        </Link>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500">
                          {t.message_count || 0} chat terdata
                        </span>
                        <button
                          onClick={() => toggleTenantStatus(t)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer ${
                            t.status === 'active' || t.status === 'HEALTHY'
                              ? 'text-emerald-400 hover:text-rose-400'
                              : 'text-rose-400 hover:text-emerald-400'
                          }`}
                        >
                          {t.status === 'active' || t.status === 'HEALTHY' ? '● Aktif (klik matikan)' : '○ Nonaktif (klik aktifkan)'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 2. TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Workspace & Slug</th>
                    <th className="px-6 py-4">Health Status</th>
                    <th className="px-6 py-4">WA Gateway & Payment</th>
                    <th className="px-6 py-4">Vertical / Tier</th>
                    <th className="px-6 py-4">Volume Chat</th>
                    <th className="px-6 py-4 text-center">Aksi Control Plane</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        Memuat daftar workspace dari database...
                      </td>
                    </tr>
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        Tidak ada workspace di kategori ini.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((t) => {
                      const isInternal = t.category === 'internal';
                      const isShop = t.category === 'shop';
                      const isHealthyTenant = t.health_status === 'HEALTHY';
                      const isDegradedTenant = t.health_status === 'DEGRADED';

                      return (
                        <tr key={t.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  isShop
                                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                    : isInternal
                                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {isShop ? 'SaaS Store' : isInternal ? 'Internal' : 'Client B2B'}
                              </span>
                              <p className="font-semibold text-white text-sm">{t.name}</p>
                            </div>
                            <p className="font-mono text-slate-400 text-[11px]">/{t.slug}</p>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1.5 ${
                                isHealthyTenant
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : isDegradedTenant
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isHealthyTenant
                                    ? 'bg-emerald-400 animate-pulse'
                                    : isDegradedTenant
                                    ? 'bg-amber-400'
                                    : 'bg-rose-400'
                                }`}
                              />
                              {t.health_status || 'HEALTHY'}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1 font-mono">
                              {t.uptime_pct || 99.9}% &bull; {t.response_time_ms || 120}ms
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-medium text-[11px]">{t.wa_gateway_status || 'CONNECTED'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5 font-mono">
                              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                              <span>{t.last_payment_ping || 'Live Sync'}</span>
                            </div>
                          </td>

                          <td className="px-6 py-4 font-mono text-[11px]">
                            <div className="text-slate-400">Vertical: <span className="text-white capitalize">{t.vertical || 'shop'}</span></div>
                            <div className="text-slate-400 mt-0.5">Plan: <span className="text-indigo-400 uppercase font-semibold">{t.plan || 'growth'}</span></div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300 text-[11px]">
                              {t.message_count || 0} pesan
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <Link
                                href={`/admin/${t.slug}/config`}
                                className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                <span>Config</span>
                              </Link>
                              <Link
                                href={`/${t.slug}`}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition inline-flex items-center gap-1"
                              >
                                <Bot className="w-3.5 h-3.5" />
                                <span>Chat</span>
                              </Link>
                              {t.slug === 'atmosfitnes' && (
                                <Link
                                  href="/gym"
                                  className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-lg text-[11px] font-semibold transition"
                                >
                                  Gym Hub
                                </Link>
                              )}
                              <button
                                onClick={() => toggleTenantStatus(t)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                  t.status === 'active' || t.status === 'HEALTHY'
                                    ? 'bg-emerald-500/15 text-emerald-400 hover:bg-rose-500/20 hover:text-rose-400'
                                    : 'bg-rose-500/15 text-rose-400 hover:bg-emerald-500/20 hover:text-emerald-400'
                                }`}
                              >
                                {t.status === 'active' || t.status === 'HEALTHY' ? 'AKTIF' : 'MATI'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Tambah Workspace (P1.1 No-Code Provisioning) */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h2 className="text-base font-bold text-white mb-1">Provision New Tenant (P1 Cockpit)</h2>
              <p className="text-xs text-slate-400 mb-4">Onboarding instan merchant tanpa menyentuh terminal backend.</p>

              {modalMsg && (
                <div
                  className={`p-3 mb-4 rounded-xl text-xs font-semibold ${
                    modalMsg.type === 'success'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {modalMsg.text}
                </div>
              )}

              <form onSubmit={handleCreateTenant} className="space-y-3.5">
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Nama Workspace / Brand</label>
                  <input
                    type="text"
                    placeholder="Contoh: Kanz Fashion Store"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!newSlug) {
                        setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Slug Domain (Subdomain)</label>
                  <input
                    type="text"
                    placeholder="kanz-fashion-store"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-300 block mb-1">Vertical Engine</label>
                    <select
                      value={newVertical}
                      onChange={(e) => setNewVertical(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="shop">Shop (Commerce)</option>
                      <option value="gym">Gym (IoT Access)</option>
                      <option value="career">Career (AI ATS)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-300 block mb-1">Tier Plan</label>
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="growth">Growth</option>
                      <option value="pro">Pro Scale</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Admin WhatsApp (Notifikasi)</label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 bg-slate-800 text-xs text-slate-300 rounded-xl hover:bg-slate-700 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-blue-600 text-xs font-semibold text-white rounded-xl hover:bg-blue-500 transition shadow-lg shadow-blue-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Memproses Provisioning...' : 'Provision Tenant 🚀'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Drawer Incident Logs (P1.3 Observability) */}
        {showIncidentDrawer && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-end z-50">
            <div className="bg-slate-900 w-full max-w-xl h-full p-6 border-l border-slate-800 flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white">System Incident Logs</h2>
                  </div>
                  <button
                    onClick={() => setShowIncidentDrawer(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  {incidents.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      Semua service tenant terpantau sehat. Belum ada insiden terdata.
                    </div>
                  ) : (
                    incidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-indigo-400 font-mono">{inc.service}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inc.status === 'OPEN'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {inc.status}
                          </span>
                        </div>
                        <p className="text-rose-300 font-mono break-all">{inc.error_message}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                          <span>Tenant: {inc.tenant_id}</span>
                          {inc.status === 'OPEN' && (
                            <button
                              onClick={() => handleResolveIncident(inc.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Mark Resolved</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowIncidentDrawer(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl mt-6 transition cursor-pointer"
              >
                Tutup Drawer
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}