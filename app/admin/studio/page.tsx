'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Film,
  Zap,
  Sparkles,
  ShieldCheck,
  Search,
  RefreshCw,
  Plus,
  History,
  CheckCircle2,
  AlertCircle,
  X,
  Sliders,
  Store,
  Users,
  Boxes,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

interface StudioTenantItem {
  id: string;
  name: string;
  slug: string;
  tier: string;
  credits_remaining: number;
  is_unlimited: boolean;
  status: string;
  created_at?: string;
}

interface LedgerItem {
  id: string;
  tenant_id: string;
  amount: number;
  balance_after: number;
  action: string;
  description: string;
  created_at: string;
}

export default function DirectoryStudioPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [loading, setLoading] = useState(true);
  const [studios, setStudios] = useState<StudioTenantItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<string>('ALL');

  // Ledger Drawer / Modal State
  const [selectedLedgerTenant, setSelectedLedgerTenant] = useState<StudioTenantItem | null>(null);
  const [ledgerHistory, setLedgerHistory] = useState<LedgerItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Edit / Quick Adjustment State
  const [editingTenant, setEditingTenant] = useState<StudioTenantItem | null>(null);
  const [editCredits, setEditCredits] = useState<number>(50);
  const [editTier, setEditTier] = useState<string>('PRO');
  const [editUnlimited, setEditUnlimited] = useState<boolean>(false);
  const [editNotes, setEditNotes] = useState<string>('');
  const [savingEntitlement, setSavingEntitlement] = useState(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);

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

  const fetchStudioTenants = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      // 1. Fetch tenants
      const { data: tenantsData, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, name, slug, tier, status, metadata, created_at')
        .order('created_at', { ascending: false });

      if (tenantErr || !tenantsData) {
        console.error('Failed to load tenants:', tenantErr);
        return;
      }

      // 2. Fetch entitlements
      const { data: entData } = await supabase
        .from('tenant_entitlements')
        .select('*');

      const entMap = new Map();
      (entData || []).forEach((e: any) => {
        entMap.set(e.tenant_id, e);
      });

      const merged: StudioTenantItem[] = tenantsData.map((t: any) => {
        const ent = entMap.get(t.id);
        const meta = t.metadata || {};
        const isFounder = String(ent?.tier || t.tier || '').toUpperCase() === 'FOUNDER';
        const isUnlimited = Boolean(ent?.is_unlimited || isFounder || meta.studio_workspace?.is_unlimited);

        return {
          id: t.id,
          name: t.name || t.slug,
          slug: t.slug,
          tier: isFounder ? 'FOUNDER' : (ent?.tier || t.tier || 'FREE'),
          credits_remaining: isUnlimited ? 999999 : (ent?.credits_remaining ?? meta.studio_workspace?.render_credits ?? 50),
          is_unlimited: isUnlimited,
          status: t.status || 'ACTIVE',
          created_at: t.created_at,
        };
      });

      setStudios(merged);
    } catch (err) {
      console.error('Error fetching studios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuth) {
      fetchStudioTenants();
    }
  }, [isAdminAuth]);

  // Open Ledger Modal
  const handleOpenLedger = async (tenant: StudioTenantItem) => {
    setSelectedLedgerTenant(tenant);
    setLoadingLedger(true);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.id)}/entitlements`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setLedgerHistory(json.data.ledger || []);
        }
      }
    } catch (e) {
      console.error('Error loading ledger:', e);
    } finally {
      setLoadingLedger(false);
    }
  };

  // Open Edit Entitlement Modal
  const handleOpenEdit = (tenant: StudioTenantItem) => {
    setEditingTenant(tenant);
    setEditCredits(tenant.is_unlimited ? 100 : tenant.credits_remaining);
    setEditTier(tenant.tier || 'PRO');
    setEditUnlimited(tenant.is_unlimited);
    setEditNotes('');
  };

  // Save Entitlement Changes
  const handleSaveEntitlements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    setSavingEntitlement(true);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(editingTenant.id)}/entitlements`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits_remaining: editUnlimited ? 999999 : editCredits,
          is_unlimited: editUnlimited,
          tier: editTier,
          notes: editNotes || `Admin adjust: tier=${editTier}, unlimited=${editUnlimited}, credits=${editCredits}`,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan perubahan entitlement');
      }

      setAlertBanner(`✅ Entitlement untuk tenant "${editingTenant.name}" (${editingTenant.slug}) berhasil diperbarui!`);
      setTimeout(() => setAlertBanner(null), 4000);
      setEditingTenant(null);
      fetchStudioTenants();
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan');
    } finally {
      setSavingEntitlement(false);
    }
  };

  // Quick toggle founder bypass
  const handleQuickToggleUnlimited = async (tenant: StudioTenantItem) => {
    const nextUnlimited = !tenant.is_unlimited;
    const nextTier = nextUnlimited ? 'FOUNDER' : (tenant.tier === 'FOUNDER' ? 'PRO' : tenant.tier);

    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.id)}/entitlements`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_unlimited: nextUnlimited,
          tier: nextTier,
          notes: nextUnlimited ? 'Founder Unlimited Bypass diaktifkan (Super Admin)' : 'Founder Bypass dinonaktifkan',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah status bypass');
      }

      fetchStudioTenants();
    } catch (err: any) {
      alert(err.message || 'Gagal toggle bypass');
    }
  };

  const filteredStudios = studios.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.slug.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTier === 'FOUNDER') return s.is_unlimited || s.tier === 'FOUNDER';
    if (filterTier === 'PRO') return s.tier === 'PRO' || s.tier === 'PRO_SCALE';
    if (filterTier === 'FREE') return s.tier === 'FREE' && !s.is_unlimited;

    return true;
  });

  const countTotal = studios.length;
  const countFounder = studios.filter((s) => s.is_unlimited || s.tier === 'FOUNDER').length;
  const countPro = studios.filter((s) => s.tier === 'PRO' || s.tier === 'PRO_SCALE').length;

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            🎬
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Directory Studio Superadmin</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengelola kuota render, founder bypass, dan ledger studio.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-purple-600/30 cursor-pointer"
            >
              Buka Directory Studio
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-purple-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850 transition cursor-pointer"
              title="Kembali ke Control Plane Overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Studio Workspaces Directory
                </span>
                <span className="text-[11px] text-slate-400">&bull; studio.boontrack.com</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Atomic Ledger Active
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Directory Studio &amp; Render Entitlements</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStudioTenants}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              title="Refresh Data Studio"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {alertBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{alertBanner}</span>
            </div>
            <button
              onClick={() => setAlertBanner(null)}
              className="text-[10px] text-slate-400 hover:text-white font-mono"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Total Studio Workspaces</span>
              <span className="text-2xl font-black text-white mt-1 block">{countTotal}</span>
              <span className="text-[10px] text-slate-500">Kreator &amp; Brand aktif</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-amber-300">Founder / Unlimited Accounts</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{countFounder}</span>
              <span className="text-[10px] text-amber-400/70">Bypass kuota render (is_unlimited)</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-indigo-300">Pro &amp; Agency Scale</span>
              <span className="text-2xl font-black text-indigo-400 mt-1 block">{countPro}</span>
              <span className="text-[10px] text-indigo-400/70">Kredit kuota render premium</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nama atau slug tenant studio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterTier('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterTier === 'ALL' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Semua ({countTotal})
            </button>
            <button
              onClick={() => setFilterTier('FOUNDER')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterTier === 'FOUNDER' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Founder ({countFounder})
            </button>
            <button
              onClick={() => setFilterTier('PRO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterTier === 'PRO' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Pro ({countPro})
            </button>
          </div>
        </div>

        {/* Main Studio Tenants Table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tenant / Brand</th>
                  <th className="py-3 px-4">Tier Status</th>
                  <th className="py-3 px-4">Sisa Kredit Render</th>
                  <th className="py-3 px-4">Founder Bypass</th>
                  <th className="py-3 px-4 text-right">Aksi &amp; Ledger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                        <span>Memuat data studio tenants...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredStudios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      Tidak ada tenant studio yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredStudios.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{s.name}</div>
                        <div className="text-[11px] font-mono text-purple-400">/{s.slug}</div>
                      </td>
                      <td className="py-3 px-4">
                        {s.is_unlimited || s.tier === 'FOUNDER' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            FOUNDER UNLIMITED
                          </span>
                        ) : s.tier === 'PRO' || s.tier === 'PRO_SCALE' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold text-[10px]">
                            PRO SCALE
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                            {s.tier || 'FREE'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s.is_unlimited ? (
                          <span className="font-bold text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            Unlimited (Bypass)
                          </span>
                        ) : (
                          <span className={`font-mono font-bold text-sm ${s.credits_remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {s.credits_remaining} <span className="text-[10px] text-slate-400 font-sans">Credits</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleQuickToggleUnlimited(s)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            s.is_unlimited
                              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                          }`}
                          title="Klik untuk toggle bypass"
                        >
                          <span className={`w-2 h-2 rounded-full ${s.is_unlimited ? 'bg-amber-400' : 'bg-slate-600'}`} />
                          {s.is_unlimited ? 'Active (ON)' : 'Disabled (OFF)'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:text-white font-medium text-[11px] transition cursor-pointer flex items-center gap-1"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Edit Kuota</span>
                          </button>
                          <button
                            onClick={() => handleOpenLedger(s)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Lihat Riwayat Transaksi Ledger"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
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

      {/* ── MODAL: EDIT ENTITLEMENTS ──────────────────────────────── */}
      {editingTenant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-black text-white text-base">Kelola Entitlement Studio</h3>
                <p className="text-xs text-purple-400 font-mono mt-0.5">/{editingTenant.slug}</p>
              </div>
              <button
                onClick={() => setEditingTenant(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEntitlements} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Subscription Tier
                </label>
                <select
                  value={editTier}
                  onChange={(e) => {
                    const nextTier = e.target.value;
                    setEditTier(nextTier);
                    if (nextTier === 'FOUNDER') {
                      setEditUnlimited(true);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="FREE">FREE</option>
                  <option value="PRO">PRO</option>
                  <option value="AGENCY">AGENCY</option>
                  <option value="FOUNDER">FOUNDER (Bypass Unlimited)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sisa Kredit Render (Credits Remaining)
                </label>
                <input
                  type="number"
                  min="0"
                  max="999999"
                  value={editCredits}
                  onChange={(e) => setEditCredits(parseInt(e.target.value) || 0)}
                  disabled={editUnlimited}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setEditCredits((prev) => prev + 50)}
                    disabled={editUnlimited}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg border border-slate-700"
                  >
                    +50
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCredits((prev) => prev + 100)}
                    disabled={editUnlimited}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg border border-slate-700"
                  >
                    +100
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCredits((prev) => prev + 500)}
                    disabled={editUnlimited}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg border border-slate-700"
                  >
                    +500
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Founder Unlimited Bypass</span>
                  <span className="text-[10px] text-slate-400">Render tanpa limit kredit</span>
                </div>
                <input
                  type="checkbox"
                  checked={editUnlimited}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEditUnlimited(checked);
                    if (checked) setEditTier('FOUNDER');
                  }}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Catatan Alasan Perubahan (Audit Log Ledger)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Topup bonus program onboarding founder"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEntitlement}
                  className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-600/30 disabled:opacity-50"
                >
                  {savingEntitlement ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: LEDGER TRANSACTION HISTORY ────────────────────── */}
      {selectedLedgerTenant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xl w-full shadow-2xl relative text-slate-100 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Riwayat Ledger Kredit</h3>
                  <p className="text-[11px] text-purple-400 font-mono">
                    {selectedLedgerTenant.name} (/{selectedLedgerTenant.slug})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLedgerTenant(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {loadingLedger ? (
                <div className="py-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Mengambil riwayat transaksi tenant_credit_ledger...</span>
                </div>
              ) : ledgerHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800/60">
                  Belum ada transaksi ledger yang tercatat untuk tenant ini.
                </div>
              ) : (
                ledgerHistory.map((item) => {
                  const isDeduct = item.amount < 0;
                  const isZero = item.amount === 0;

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              item.action === 'RESERVE'
                                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                : item.action === 'RELEASE'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : item.action === 'FOUNDER_BYPASS'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {item.action}
                          </span>
                          <span className="text-[11px] text-slate-300">{item.description}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          {new Date(item.created_at).toLocaleString('id-ID')}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`font-mono font-bold block ${
                            isDeduct
                              ? 'text-rose-400'
                              : isZero
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {item.amount > 0 ? `+${item.amount}` : item.amount}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Saldo: {item.balance_after}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
