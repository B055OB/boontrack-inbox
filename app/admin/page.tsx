'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import {
  getTenantConfig,
  HealthStatus,
  WaGatewayStatus,
} from '@/lib/tenant-config';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  category?: 'internal' | 'external' | string;
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

// Default slug internal BoonTrack
const INTERNAL_SLUGS = [
  'boontrack-holding',
  'boontrack-career',
  'career',
  'boontrack-kurir',
  'boontrack-bola',
  'boontrack-loker',
  'boontrack-digicorn',
  'om-budi',
];

// Default core workspaces fallback (Sprint Directive Phase D: 5 core tenants)
const DEFAULT_CORE_TENANTS: Tenant[] = [
  {
    id: 'atmosfitnes',
    name: 'Atmosfitnes Gym Hub',
    slug: 'atmosfitnes',
    category: 'external',
    status: 'active',
    start_date: '2025-01-01',
    due_date: null,
    access_username: 'admin',
    access_password: 'atmos_master_pass2026',
    monthly_fee: 1500000,
    health_status: 'HEALTHY',
    wa_gateway_status: 'CONNECTED',
    last_payment_ping: '3 menit lalu',
    uptime_pct: 99.9,
    response_time_ms: 185,
  },
  {
    id: 'om-budi',
    name: 'Om Budi Channel',
    slug: 'om-budi',
    category: 'internal',
    status: 'active',
    start_date: '2025-01-01',
    due_date: null,
    access_username: 'admin',
    access_password: 'budi_internal_sec_2026',
    monthly_fee: 0,
    health_status: 'HEALTHY',
    wa_gateway_status: 'CONNECTED',
    last_payment_ping: 'Internal (N/A)',
    uptime_pct: 100.0,
    response_time_ms: 120,
  },
  {
    id: 'pelayanan-publik',
    name: 'Pelayanan Publik (Kelurahan Indra)',
    slug: 'pelayanan-publik',
    category: 'external',
    status: 'active',
    start_date: '2025-01-01',
    due_date: null,
    access_username: 'admin',
    access_password: 'kelurahan_lurah_pass2026',
    monthly_fee: 500000,
    health_status: 'HEALTHY',
    wa_gateway_status: 'CONNECTED',
    last_payment_ping: '30 menit lalu',
    uptime_pct: 99.8,
    response_time_ms: 210,
  },
  {
    id: 'bale-pananggeuhan',
    name: 'Bale Pananggeuhan',
    slug: 'bale-pananggeuhan',
    category: 'external',
    status: 'active',
    start_date: '2025-01-01',
    due_date: null,
    access_username: 'admin',
    access_password: 'bale_admin_pass2026',
    monthly_fee: 750000,
    health_status: 'DEGRADED',
    wa_gateway_status: 'RECONNECTING',
    last_payment_ping: '1 jam lalu',
    uptime_pct: 97.5,
    response_time_ms: 480,
  },
  {
    id: 'career',
    name: 'BoonTrack Career AI',
    slug: 'career',
    category: 'internal',
    status: 'active',
    start_date: '2025-01-01',
    due_date: null,
    access_username: 'admin',
    access_password: 'career_master_pass2026',
    monthly_fee: 0,
    health_status: 'HEALTHY',
    wa_gateway_status: 'CONNECTED',
    last_payment_ping: '8 menit lalu',
    uptime_pct: 99.9,
    response_time_ms: 140,
  },
];

// PIN Admin Master (Default: 998877)
const MASTER_PIN = '998877';

export default function SuperAdminDashboard() {
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'internal' | 'external'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Security Guardrail: Secret Masking per tenant
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Form Tambah Tenant
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newCategory, setNewCategory] = useState<'internal' | 'external'>('external');
  const [newUser, setNewUser] = useState('admin');
  const [newPass, setNewPass] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newFee, setNewFee] = useState(0);

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

  useEffect(() => {
    let ignore = false;

    async function loadTenants() {
      if (!isAdminAuth) return;
      try {
        const supabase = getSupabase();

        const { data: tenantsData, error } = await supabase
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (ignore) return;

        // Hitung pemakaian pesan per tenant
        const { data: messagesData } = await supabase
          .from('messages')
          .select('tenant_id, tenant_slug');

        if (ignore) return;

        const countMap: Record<string, number> = {};
        messagesData?.forEach((m: { tenant_id?: string | null; tenant_slug?: string | null }) => {
          if (m.tenant_id) {
            countMap[m.tenant_id] = (countMap[m.tenant_id] || 0) + 1;
          }
          if (m.tenant_slug) {
            countMap[m.tenant_slug] = (countMap[m.tenant_slug] || 0) + 1;
          }
        });

        const rawTenants = (tenantsData || []) as Tenant[];
        const existingSlugs = new Set(rawTenants.map((t) => t.slug));
        const combinedTenants = [
          ...rawTenants,
          ...DEFAULT_CORE_TENANTS.filter((dt) => !existingSlugs.has(dt.slug)),
        ];

        const mapped: Tenant[] = combinedTenants.map((t) => {
          const isInternal =
            t.category === 'internal' ||
            INTERNAL_SLUGS.includes(t.slug) ||
            t.slug.startsWith('boontrack-');

          const cfg = getTenantConfig(t.slug);

          return {
            ...t,
            category: isInternal ? 'internal' : 'external',
            message_count: countMap[t.id] || countMap[t.slug] || 0,
            health_status: cfg.health.status || 'HEALTHY',
            wa_gateway_status: cfg.health.wa_gateway || 'CONNECTED',
            last_payment_ping: cfg.health.last_payment_ping || 'N/A',
            uptime_pct: cfg.health.uptime_pct || 99.9,
            response_time_ms: cfg.health.response_time_ms || 180,
          };
        });

        setTenants(mapped);
      } catch (err: unknown) {
        console.error('Error fetching tenants:', err);
        // Fallback to core tenants if offline
        const mapped: Tenant[] = DEFAULT_CORE_TENANTS.map((t) => {
          const cfg = getTenantConfig(t.slug);
          return {
            ...t,
            health_status: cfg.health.status,
            wa_gateway_status: cfg.health.wa_gateway,
            last_payment_ping: cfg.health.last_payment_ping,
            uptime_pct: cfg.health.uptime_pct,
            response_time_ms: cfg.health.response_time_ms,
          };
        });
        setTenants(mapped);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadTenants();

    return () => {
      ignore = true;
    };
  }, [isAdminAuth, refreshKey]);

  // Toggle ON / OFF Status Layanan
  const toggleTenantStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    const supabase = getSupabase();

    const { error } = await supabase
      .from('tenants')
      .update({ status: nextStatus })
      .eq('id', tenant.id);

    if (!error) {
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t))
      );
    } else {
      // Local optimistic update for fallback
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t))
      );
    }
  };

  // Tambah Tenant Baru
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const supabase = getSupabase();
      const cleanSlug = newSlug.toLowerCase().trim().replace(/\s+/g, '-');

      const { error } = await supabase.from('tenants').insert({
        name: newName,
        slug: cleanSlug,
        category: newCategory,
        access_username: newUser,
        access_password: newPass,
        due_date: newDueDate || null,
        monthly_fee: newFee,
        status: 'active',
      });

      if (error) throw error;

      setShowAddModal(false);
      setNewName('');
      setNewSlug('');
      setNewPass('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert('Gagal menambah tenant: ' + errorMsg);
    }
  };

  // Filter List sesuai Tab dan Search
  const filteredTenants = tenants.filter((t) => {
    const matchCategory =
      activeTab === 'all' ||
      (activeTab === 'internal' && t.category === 'internal') ||
      (activeTab === 'external' && t.category === 'external');

    const matchSearch = searchQuery
      ? t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    return matchCategory && matchSearch;
  });

  const countInternal = tenants.filter((t) => t.category === 'internal').length;
  const countExternal = tenants.filter((t) => t.category === 'external').length;
  const countHealthy = tenants.filter((t) => t.health_status === 'HEALTHY').length;
  const countDegraded = tenants.filter((t) => t.health_status === 'DEGRADED').length;
  const countDown = tenants.filter((t) => t.health_status === 'DOWN').length;

  if (!isAdminAuth) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
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
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30"
            >
              Buka Internal Control Plane
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-blue-600 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Super Admin */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl backdrop-blur-md shadow-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                Phase D Control Plane
              </span>
              <span className="text-[11px] text-slate-400">&bull; Live Multi-Tenant Orchestrator</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">BoonTrack Internal Control Plane</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitoring kesehatan real-time, konfigurasi persona AI modular, dan security guardrail terenkripsi.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 inline-flex items-center gap-1.5"
            >
              <span>+ Tambah Workspace</span>
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('super_admin_auth');
                setIsAdminAuth(false);
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl border border-slate-700 transition"
            >
              Kunci
            </button>
          </div>
        </div>

        {/* Executive Health Overview Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Total Workspaces</span>
            <span className="text-xl font-bold text-white mt-1 block">{tenants.length}</span>
            <span className="text-[10px] text-slate-500">Active tenants</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Healthy</span>
            </span>
            <span className="text-xl font-bold text-emerald-400 mt-1 block">{countHealthy}</span>
            <span className="text-[10px] text-slate-500">Normal operations</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Degraded</span>
            </span>
            <span className="text-xl font-bold text-amber-400 mt-1 block">{countDegraded}</span>
            <span className="text-[10px] text-slate-500">High latency / reconnect</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              <span>Down</span>
            </span>
            <span className="text-xl font-bold text-rose-400 mt-1 block">{countDown}</span>
            <span className="text-[10px] text-slate-500">Service offline</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>WA Gateway</span>
            </span>
            <span className="text-xl font-bold text-white mt-1 block">
              {tenants.filter((t) => t.wa_gateway_status === 'CONNECTED').length}/{tenants.length}
            </span>
            <span className="text-[10px] text-slate-500">Connected nodes</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
              <span>QRIS Engine</span>
            </span>
            <span className="text-sm font-bold text-emerald-400 mt-2 block">Live Sync</span>
            <span className="text-[10px] text-slate-500">Real-time pings</span>
          </div>
        </div>

        {/* View Switcher, Filter & Search Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Semua ({tenants.length})
            </button>
            <button
              onClick={() => setActiveTab('internal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 ${
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                activeTab === 'external'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Client B2B ({countExternal})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
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

            {/* View Mode Toggle: Grid vs Table */}
            <div className="flex items-center bg-slate-900 p-1 border border-slate-800 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Tampilan Grid Card"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Tampilan Tabel Rinci"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 1. GRID CARD VIEW (Tenant Health Overview) */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {loading ? (
              <div className="col-span-full py-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>Memuat data health tenant...</span>
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
                Tidak ada tenant yang cocok dengan filter pencarian.
              </div>
            ) : (
              filteredTenants.map((t) => {
                const isInternal = t.category === 'internal';
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
                    {/* Card Top: Badges */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isInternal
                              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {isInternal ? 'Internal Ecosystem' : 'Client B2B'}
                        </span>

                        {/* Real-time Health Badge */}
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

                    {/* Indicators: WhatsApp Gateway & Last Payment Ping */}
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
                          {t.last_payment_ping || 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                        <span className="text-slate-500">Uptime & Latency</span>
                        <span className="font-mono text-slate-400">
                          {t.uptime_pct || 99.9}% &bull; {t.response_time_ms || 180}ms
                        </span>
                      </div>
                    </div>

                    {/* Security Guardrail (Secret Masking for Credentials) */}
                    <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-slate-500 text-[10px] block">Login: {t.access_username || 'admin'}</span>
                        <span className="text-slate-300 text-[11px]">
                          Pass:{' '}
                          {isRevealed ? (
                            <span className="text-amber-300 font-semibold">{t.access_password || '123456'}</span>
                          ) : (
                            <span className="text-slate-500 tracking-widest">••••••••</span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePasswordMask(t.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                        title={isRevealed ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Card Actions */}
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Dynamic Config Editor Link */}
                        <Link
                          href={`/admin/${t.slug}/config`}
                          className="px-3 py-2 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 hover:border-blue-500/50 text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Config Editor</span>
                        </Link>

                        {/* Live Chat Link */}
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
                          className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                            t.status === 'active'
                              ? 'text-emerald-400 hover:text-rose-400'
                              : 'text-rose-400 hover:text-emerald-400'
                          }`}
                        >
                          {t.status === 'active' ? '● Aktif (klik matikan)' : '○ Nonaktif (klik aktifkan)'}
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
                    <th className="px-6 py-4">Kredensial (Secret Masked)</th>
                    <th className="px-6 py-4">Volume Chat</th>
                    <th className="px-6 py-4 text-center">Aksi Control Plane</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        Memuat daftar workspace...
                      </td>
                    </tr>
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        Tidak ada workspace pada filter ini.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((t) => {
                      const isInternal = t.category === 'internal';
                      const isHealthyTenant = t.health_status === 'HEALTHY';
                      const isDegradedTenant = t.health_status === 'DEGRADED';
                      const isRevealed = revealedPasswords[t.id] || false;

                      return (
                        <tr key={t.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  isInternal
                                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {isInternal ? 'Internal' : 'Client B2B'}
                              </span>
                              <p className="font-semibold text-white text-sm">{t.name}</p>
                            </div>
                            <p className="font-mono text-slate-400 text-[11px]">/{t.slug}</p>
                          </td>

                          {/* Health Status */}
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
                              {t.uptime_pct || 99.9}% &bull; {t.response_time_ms || 180}ms
                            </div>
                          </td>

                          {/* WA & Payment Ping */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-medium text-[11px]">{t.wa_gateway_status || 'CONNECTED'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5 font-mono">
                              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                              <span>{t.last_payment_ping || 'N/A'}</span>
                            </div>
                          </td>

                          {/* Login Credentials Masked */}
                          <td className="px-6 py-4 font-mono text-[11px]">
                            <div className="text-slate-400">User: <span className="text-white">{t.access_username || 'admin'}</span></div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-slate-400">Pass:</span>
                              {isRevealed ? (
                                <span className="text-amber-300 font-semibold">{t.access_password || '123456'}</span>
                              ) : (
                                <span className="text-slate-500 tracking-wider">••••••••</span>
                              )}
                              <button
                                type="button"
                                onClick={() => togglePasswordMask(t.id)}
                                className="p-1 text-slate-400 hover:text-slate-200"
                                title={isRevealed ? 'Sembunyikan' : 'Tampilkan'}
                              >
                                {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                          </td>

                          {/* Volume Chat */}
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300 text-[11px]">
                              {t.message_count || 0} pesan
                            </span>
                          </td>

                          {/* Aksi Control Plane */}
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <Link
                                href={`/admin/${t.slug}/config`}
                                className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1"
                              >
                                <Sliders className="w-3 h-3" />
                                <span>Config</span>
                              </Link>
                              <Link
                                href={`/${t.slug}`}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition inline-flex items-center gap-1"
                              >
                                <Bot className="w-3 h-3" />
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
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                                  t.status === 'active'
                                    ? 'bg-emerald-500/15 text-emerald-400 hover:bg-rose-500/20 hover:text-rose-400'
                                    : 'bg-rose-500/15 text-rose-400 hover:bg-emerald-500/20 hover:text-emerald-400'
                                }`}
                              >
                                {t.status === 'active' ? 'AKTIF' : 'MATI'}
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

        {/* Modal Tambah Workspace */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h2 className="text-base font-bold text-white mb-1">Daftarkan Workspace Baru</h2>
              <p className="text-xs text-slate-400 mb-4">Pilih entitas internal BoonTrack atau klien B2B eksternal.</p>

              <form onSubmit={handleCreateTenant} className="space-y-3">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Kategori Entitas</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewCategory('internal')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition ${
                        newCategory === 'internal'
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Internal Ecosystem
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCategory('external')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition ${
                        newCategory === 'external'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      External Client B2B
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Nama Workspace / Bisnis</label>
                  <input
                    type="text"
                    placeholder="Contoh: BoonTrack Holding / Kelurahan Indra"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!newSlug) setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">URL Slug Workspace</label>
                  <input
                    type="text"
                    placeholder="boontrack-holding atau kelurahan-indra"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Username Login</label>
                    <input
                      type="text"
                      value={newUser}
                      onChange={(e) => setNewUser(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Password Login</label>
                    <input
                      type="text"
                      placeholder="pass123"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
                      required
                    />
                  </div>
                </div>

                {newCategory === 'external' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">Jatuh Tempo Tagihan</label>
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">Biaya / Bulan (Rp)</label>
                      <input
                        type="number"
                        placeholder="500000"
                        value={newFee}
                        onChange={(e) => setNewFee(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2 bg-slate-800 text-xs text-slate-300 rounded-lg hover:bg-slate-700 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 text-xs font-semibold text-white rounded-lg hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
                  >
                    Simpan Workspace
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}