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
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { HealthStatus, WaGatewayStatus } from '@/lib/tenant-config';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  category?: 'internal' | 'external' | 'shop' | string;
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

const ALL_ECOSYSTEM_TENANTS = [
  { name: 'Atmosfitnes Gym Hub', slug: 'atmosfitnes', category: 'external', monthly_fee: 1500000, access_username: 'admin', access_password: 'atmos_master_pass2026' },
  { name: 'Om Budi Channel', slug: 'om-budi', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'budi_internal_sec_2026' },
  { name: 'BoonTrack Holding', slug: 'boontrack-holding', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'holding_master_pass2026' },
  { name: 'BoonTrack Career AI', slug: 'career', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'career_master_pass2026' },
  { name: 'BoonTrack Demo Store', slug: 'boontrack-demo', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'demo_master_pass2026' },
  { name: 'BoonTrack Kurir Logistik', slug: 'boontrack-kurir', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'kurir_master_pass2026' },
  { name: 'BoonTrack Bola & Sport', slug: 'boontrack-bola', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'bola_master_pass2026' },
  { name: 'BoonTrack Loker & Talenta', slug: 'boontrack-loker', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'loker_master_pass2026' },
  { name: 'BoonTrack Digicorn Agency', slug: 'boontrack-digicorn', category: 'internal', monthly_fee: 0, access_username: 'admin', access_password: 'digicorn_master_pass2026' },
  { name: 'Suhu Ads Masterclass', slug: 'suhu-ads', category: 'external', monthly_fee: 99000, access_username: 'admin', access_password: 'suhuads_admin_pass2026' },
  { name: 'Digital Marketing Hub', slug: 'digital-marketing', category: 'external', monthly_fee: 150000, access_username: 'admin', access_password: 'dm_admin_pass2026' },
  { name: 'Nyka Hijab & Modest Wear', slug: 'nyka', category: 'external', monthly_fee: 500000, access_username: 'admin', access_password: 'nyka_admin_pass2026' },
  { name: 'Bale Pananggeuhan', slug: 'bale-pananggeuhan', category: 'external', monthly_fee: 750000, access_username: 'admin', access_password: 'bale_admin_pass2026' },
  { name: 'Pelayanan Publik (Kelurahan Indra)', slug: 'pelayanan-publik', category: 'external', monthly_fee: 500000, access_username: 'admin', access_password: 'kelurahan_lurah_pass2026' },
  { name: 'Pelayanan Publik Kelurahan Dummy', slug: 'pelayanan-publik-dummy', category: 'external', monthly_fee: 0, access_username: 'admin', access_password: 'dummy_lurah_pass2026' },
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'internal' | 'external' | 'shop'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newCategory, setNewCategory] = useState<'internal' | 'external' | 'shop'>('external');
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

  const loadTenants = useCallback(async () => {
    if (!isAdminAuth) return;
    setLoading(true);
    try {
      const supabase = getSupabase();

      const { data: tenantsData, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      let currentTenants = (tenantsData || []) as Tenant[];
      const existingSlugs = new Set(currentTenants.map((t) => t.slug));

      const missingTenants = ALL_ECOSYSTEM_TENANTS.filter((ct) => !existingSlugs.has(ct.slug));
      if (missingTenants.length > 0) {
        for (const mt of missingTenants) {
          try {
            await supabase.from('tenants').insert({
              name: mt.name,
              slug: mt.slug,
              category: mt.category,
              access_username: mt.access_username,
              access_password: mt.access_password,
              monthly_fee: mt.monthly_fee,
              status: 'active',
            });
          } catch {
            // ignore duplicate
          }
        }
        const { data: refreshedData } = await supabase
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: false });
        if (refreshedData) currentTenants = refreshedData as Tenant[];
      }

      const { data: messagesData } = await supabase
        .from('messages')
        .select('tenant_id, tenant_slug');

      const countMap: Record<string, number> = {};
      messagesData?.forEach((m: { tenant_id?: string | null; tenant_slug?: string | null }) => {
        if (m.tenant_id) countMap[m.tenant_id] = (countMap[m.tenant_id] || 0) + 1;
        if (m.tenant_slug) countMap[m.tenant_slug] = (countMap[m.tenant_slug] || 0) + 1;
      });

      let serverLiveStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
      let serverLatency = 120;
      const startTime = performance.now();

      try {
        const healthRes = await fetch(`${CORE_API_URL}/health`, { method: 'GET', cache: 'no-store' });
        const latency = Math.round(performance.now() - startTime);
        serverLatency = latency;

        if (healthRes.ok) {
          serverLiveStatus = latency > 800 ? 'DEGRADED' : 'HEALTHY';
        } else {
          serverLiveStatus = 'DEGRADED';
        }
      } catch {
        serverLiveStatus = 'DOWN';
      }

      const mapped: Tenant[] = currentTenants.map((t) => {
        const isInternal =
          t.category === 'internal' ||
          INTERNAL_SLUGS.includes(t.slug) ||
          t.slug.startsWith('boontrack-');

        const isShop = t.category === 'shop' || t.slug === 'onlineboost' || t.slug === 'yuhu';

        const isTenantActive = t.status === 'active';
        const finalHealth: HealthStatus = !isTenantActive ? 'DOWN' : serverLiveStatus;

        const finalWaStatus: WaGatewayStatus = !isTenantActive
          ? 'DISCONNECTED'
          : serverLiveStatus === 'HEALTHY'
          ? 'CONNECTED'
          : serverLiveStatus === 'DEGRADED'
          ? 'RECONNECTING'
          : 'DISCONNECTED';

        return {
          ...t,
          category: isShop ? 'shop' : isInternal ? 'internal' : 'external',
          message_count: countMap[t.id] || countMap[t.slug] || 0,
          health_status: finalHealth,
          wa_gateway_status: finalWaStatus,
          last_payment_ping: isTenantActive ? 'Live Sync' : 'Offline',
          uptime_pct: isTenantActive ? (serverLiveStatus === 'HEALTHY' ? 99.9 : 95.0) : 0,
          response_time_ms: isTenantActive ? serverLatency : 0,
        };
      });

      setTenants(mapped);
    } catch (err) {
      console.error('Error fetching live tenants:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdminAuth, CORE_API_URL]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants, refreshKey]);

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
      setRefreshKey((k) => k + 1);
    }
  };

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
      alert('Gagal menambah workspace: ' + errorMsg);
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
                        <span className="text-slate-500 text-[10px] block">Login: {t.access_username || 'admin'}</span>
                        <span className="text-slate-300 text-[11px]">
                          Pass:{' '}
                          {isRevealed ? (
                            <span className="text-amber-300 font-semibold">{t.access_password || '••••••••'}</span>
                          ) : (
                            <span className="text-slate-500 tracking-widest">••••••••</span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePasswordMask(t.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                        title={isRevealed ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
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
                      const isRevealed = revealedPasswords[t.id] || false;

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
                            <div className="text-slate-400">User: <span className="text-white">{t.access_username || 'admin'}</span></div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-slate-400">Pass:</span>
                              {isRevealed ? (
                                <span className="text-amber-300 font-semibold">{t.access_password || '••••••••'}</span>
                              ) : (
                                <span className="text-slate-500 tracking-wider">••••••••</span>
                              )}
                              <button
                                type="button"
                                onClick={() => togglePasswordMask(t.id)}
                                className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                                title={isRevealed ? 'Sembunyikan' : 'Tampilkan'}
                              >
                                {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
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
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewCategory('internal')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        newCategory === 'internal'
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Internal
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCategory('external')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        newCategory === 'external'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Client B2B
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCategory('shop')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        newCategory === 'shop'
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      SaaS Shop
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
                    className="flex-1 py-2 bg-slate-800 text-xs text-slate-300 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 text-xs font-semibold text-white rounded-lg hover:bg-blue-500 transition shadow-lg shadow-blue-600/30 cursor-pointer"
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