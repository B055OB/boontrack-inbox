'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Store,
  Search,
  RefreshCw,
  Plus,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wifi,
  Sparkles,
  Layers,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Filter,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import GrantAccessModal from '@/app/admin/components/GrantAccessModal';
import { resolveCanonicalTier, getRemainingDays } from '@/lib/subscription-tiers';

const MASTER_PIN = '998877';

export default function DirectoryShopPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Active view tab: 'merchants' | 'servers'
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<'merchants' | 'servers'>('merchants');

  // Merchant Shops State
  const [shops, setShops] = useState<any[]>([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [shopSearch, setShopSearch] = useState('');
  const [selectedVertical, setSelectedVertical] = useState('ALL');

  // Workspaces / Server Instances State (Moved from Beranda)
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [workspaceCategory, setWorkspaceCategory] = useState<'all' | 'custom_b2b' | 'b2g' | 'internal'>('all');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Grant Access Modal
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [selectedShopForGrant, setSelectedShopForGrant] = useState<any | null>(null);
  const [grantBannerMsg, setGrantBannerMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem('super_admin_auth') === 'true';
      setIsAdminAuth(isAuth);
    }
  }, []);

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

  const fetchAllData = async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    // Fetch all tenants
    setLoadingShops(true);
    setLoadingWorkspaces(true);

    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('name', { ascending: true });

      if (error || !data) {
        console.error('Failed to load tenants:', error);
        return;
      }

      // Segregate into Merchant Shops vs System Workspaces
      const merchantList = data.filter((t: any) => {
        if (t.status === 'ARCHIVED' || t.metadata?.is_archived === true) return false;
        const meta = t.metadata || {};
        if (meta.is_saas === true) return true;
        if (meta.is_internal === true || meta.workspace_type === 'internal' || t.category === 'internal') {
          return false;
        }
        return true;
      });

      const serverList = data.filter((t: any) => {
        const meta = t.metadata || {};
        return (
          t.category === 'custom_b2b' ||
          t.category === 'b2g' ||
          t.category === 'internal' ||
          meta.workspace_type === 'internal' ||
          meta.is_internal === true
        );
      });

      setShops(merchantList);
      setWorkspaces(serverList.length > 0 ? serverList : data.slice(0, 15));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingShops(false);
      setLoadingWorkspaces(false);
    }
  };

  useEffect(() => {
    if (isAdminAuth) {
      fetchAllData();
    }
  }, [isAdminAuth]);

  // Grant Success Handler
  const handleGrantSuccess = (json: any) => {
    setGrantBannerMsg(`✅ Akses khusus "${json.tier_name || 'PRO'}" berhasil diberikan ke ${json.tenant_slug || ''}!`);
    setTimeout(() => setGrantBannerMsg(null), 4000);
    fetchAllData();
  };

  // Filtered Merchant Shops
  const filteredShops = useMemo(() => {
    return shops.filter((s) => {
      const matchesSearch =
        (s.name || '').toLowerCase().includes(shopSearch.toLowerCase()) ||
        (s.slug || '').toLowerCase().includes(shopSearch.toLowerCase());
      return matchesSearch;
    });
  }, [shops, shopSearch]);

  // Filtered Workspaces
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((w) => {
      const matchesSearch =
        (w.name || '').toLowerCase().includes(workspaceSearch.toLowerCase()) ||
        (w.slug || '').toLowerCase().includes(workspaceSearch.toLowerCase());

      if (!matchesSearch) return false;
      if (workspaceCategory !== 'all' && w.category !== workspaceCategory) return false;
      return true;
    });
  }, [workspaces, workspaceSearch, workspaceCategory]);

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            🛍️
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Directory Shop Superadmin</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengakses inventaris toko merchant &amp; server instances.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Buka Directory Shop
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-blue-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850 transition cursor-pointer"
              title="Kembali ke Executive Control Plane"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Directory Shop Hub
                </span>
                <span className="text-[11px] text-slate-400">&bull; shop.boontrack.com</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Directory Shop &amp; Workspaces</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAllData}
              disabled={loadingShops}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingShops ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {grantBannerMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{grantBannerMsg}</span>
            </div>
            <button
              onClick={() => setGrantBannerMsg(null)}
              className="text-[10px] text-slate-400 hover:text-white font-mono"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Top View Selector Tabs: Merchants vs Server Instances */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveDirectoryTab('merchants')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer ${
              activeDirectoryTab === 'merchants'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Daftar Merchant Toko ({shops.length})</span>
          </button>
          <button
            onClick={() => setActiveDirectoryTab('servers')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer ${
              activeDirectoryTab === 'servers'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Status Server &amp; Workspaces ({workspaces.length})</span>
          </button>
        </div>

        {/* ── TAB 1: DAFTAR MERCHANT TOKO ───────────────────────────── */}
        {activeDirectoryTab === 'merchants' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari toko berdasarkan nama atau slug..."
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-850/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Nama Toko &amp; Slug</th>
                      <th className="py-3 px-4">Tier Langganan</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingShops ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                            <span>Memuat direktori merchant...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredShops.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-500">
                          Tidak ada toko yang sesuai dengan pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredShops.map((shop) => (
                        <tr key={shop.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm">{shop.name}</div>
                            <div className="text-[11px] font-mono text-blue-400">/{shop.slug}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold text-[10px]">
                              {shop.tier || 'SOLO'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-semibold text-emerald-400">
                              {shop.status || 'ACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setSelectedShopForGrant(shop);
                                  setGrantModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 hover:text-white font-medium text-[11px] transition cursor-pointer flex items-center gap-1"
                              >
                                <Sparkles className="w-3 h-3 text-indigo-400" />
                                <span>Beri Grant</span>
                              </button>
                              <a
                                href={`https://shop.boontrack.com/${shop.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                title="Lihat Toko"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: STATUS SERVER & WORKSPACES (Dipindahkan dari Beranda) ── */}
        {activeDirectoryTab === 'servers' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari workspace instance..."
                  value={workspaceSearch}
                  onChange={(e) => setWorkspaceSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setWorkspaceCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    workspaceCategory === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setWorkspaceCategory('custom_b2b')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    workspaceCategory === 'custom_b2b' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Custom B2B
                </button>
                <button
                  onClick={() => setWorkspaceCategory('b2g')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    workspaceCategory === 'b2g' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  B2G Civic
                </button>
                <button
                  onClick={() => setWorkspaceCategory('internal')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    workspaceCategory === 'internal' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Internal
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loadingWorkspaces ? (
                <div className="col-span-full py-12 text-center text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Memuat workspace server telemetry...</span>
                </div>
              ) : filteredWorkspaces.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
                  Tidak ada workspace instance yang cocok.
                </div>
              ) : (
                filteredWorkspaces.map((ws) => (
                  <div
                    key={ws.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700 transition space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {ws.category || 'SYSTEM WORKSPACE'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          ONLINE
                        </span>
                      </div>

                      <h3 className="text-base font-black text-white">{ws.name}</h3>
                      <p className="text-xs font-mono text-slate-400">/{ws.slug}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <span className="text-[11px]">WA Gateway: Connected</span>
                      <span className="text-[11px] font-mono text-emerald-400">P95: 18ms</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grant Access Modal */}
      <GrantAccessModal
        isOpen={grantModalOpen}
        onClose={() => setGrantModalOpen(false)}
        shop={selectedShopForGrant}
        onSuccess={handleGrantSuccess}
      />
    </main>
  );
}
