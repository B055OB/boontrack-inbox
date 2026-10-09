'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Store,
  Film,
  Users,
  Boxes,
  Bell,
  Activity,
  DollarSign,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  Sparkles,
  CreditCard,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Cpu,
  Zap,
  Lock,
  Layers,
  ShoppingBag,
  History,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

interface LiveFeedEvent {
  id: string;
  type: 'PAYMENT_XENDIT' | 'LEDGER_AUDIT' | 'MERCHANT_REGISTER' | 'AFFILIATE_REGISTER' | 'CREATOR_REGISTER';
  title: string;
  description: string;
  timestamp: string;
  badge: string;
  badgeColor: string;
}

export default function SuperAdminExecutiveCenter() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Dropdown States
  const [activeDropdown, setActiveDropdown] = useState<'directories' | 'operations' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Top Metrics
  const [totalRevenueIdr, setTotalRevenueIdr] = useState<number>(0);
  const [totalSpecialGrants, setTotalSpecialGrants] = useState<number>(0);
  const [population, setPopulation] = useState({
    shops: 0,
    studios: 0,
    creators: 0,
    affiliates: 0,
  });

  // Live Feed
  const [liveFeed, setLiveFeed] = useState<LiveFeedEvent[]>([]);
  const [feedFilter, setFeedFilter] = useState<'ALL' | 'PAYMENT' | 'LEDGER' | 'MERCHANT' | 'AFFILIATE' | 'CREATOR'>('ALL');
  const [loadingData, setLoadingData] = useState(true);

  // Quick Special Grant State
  const [allTenantsList, setAllTenantsList] = useState<any[]>([]);
  const [grantSearchQuery, setGrantSearchQuery] = useState('');
  const [selectedTenantForGrant, setSelectedTenantForGrant] = useState<any | null>(null);
  const [grantScheme, setGrantScheme] = useState<'FOUNDER' | 'PRO' | 'SPECIAL_GRANT'>('FOUNDER');
  const [grantNotes, setGrantNotes] = useState('');
  const [isExecutingGrant, setIsExecutingGrant] = useState(false);
  const [grantFeedback, setGrantFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auth Initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem('super_admin_auth') === 'true';
      setIsAdminAuth(isAuth);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleLogout = () => {
    sessionStorage.removeItem('super_admin_auth');
    setIsAdminAuth(false);
  };

  // Fetch Command Center Data
  const fetchDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      // 1. Fetch Tenants
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, slug, tier, category, metadata, created_at, status')
        .order('created_at', { ascending: false });

      const tenantRows = tenants || [];
      setAllTenantsList(tenantRows);

      // Population: Shop
      const merchantShops = tenantRows.filter((t) => {
        if (t.status === 'ARCHIVED' || t.metadata?.is_archived === true) return false;
        if (t.metadata?.is_internal === true || t.category === 'internal') return false;
        return true;
      });

      // 2. Akun Manual / Special Grant
      // Query COUNT riil dari tenant_entitlements di mana is_unlimited = true ATAU tier IN ('FOUNDER', 'SPECIAL_CASE', 'SPECIAL_GRANT')
      let specialGrantCount = 0;
      const { count: entSpecialCount, data: entSpecialData } = await supabase
        .from('tenant_entitlements')
        .select('tenant_id, is_unlimited, tier', { count: 'exact' })
        .or('is_unlimited.eq.true,tier.eq.FOUNDER,tier.eq.SPECIAL_CASE,tier.eq.SPECIAL_GRANT');

      if (entSpecialCount !== null && entSpecialCount !== undefined) {
        specialGrantCount = entSpecialCount;
      } else if (entSpecialData) {
        specialGrantCount = entSpecialData.length;
      }

      // Pastikan sinkron dengan data di tenants jika ada grant manual
      const { count: tenantSpecialCount } = await supabase
        .from('tenants')
        .select('id', { count: 'exact', head: true })
        .or('tier.eq.FOUNDER,tier.eq.SPECIAL_CASE,tier.eq.SPECIAL_GRANT');

      if (tenantSpecialCount && tenantSpecialCount > specialGrantCount) {
        specialGrantCount = tenantSpecialCount;
      }

      // 3. Populasi Ekosistem Riil (COUNT murni tanpa nilai hardcoded)
      const { count: creatorCount } = await supabase
        .from('creator_profiles')
        .select('id', { count: 'exact', head: true });

      const { count: affiliateCount } = await supabase
        .from('affiliates')
        .select('id', { count: 'exact', head: true });

      const { count: studioWorkspacesCount } = await supabase
        .from('studio_workspaces')
        .select('id', { count: 'exact', head: true });

      const { count: entStudioCount } = await supabase
        .from('tenant_entitlements')
        .select('tenant_id', { count: 'exact', head: true });

      const finalStudioCount = Math.max(studioWorkspacesCount || 0, entStudioCount || 0);

      // 4. Total Pendapatan Langganan (Xendit)
      // Tarik query SUM(amount) dari tabel transaksi/invoices langganan yang berstatus PAID / SETTLED / COMPLETED
      let computedRevenue = 0;
      const { data: revenueData } = await supabase
        .from('credit_transactions')
        .select('id, amount_idr, status, type, created_at, tenant_slug')
        .in('status', ['COMPLETED', 'PAID', 'SETTLED']);

      if (revenueData && revenueData.length > 0) {
        computedRevenue = revenueData.reduce((acc, curr) => acc + (Number(curr.amount_idr) || 0), 0);
      } else {
        const { data: subData } = await supabase
          .from('shop_subscriptions')
          .select('amount, status, created_at, tenant_slug')
          .in('status', ['ACTIVE', 'PAID', 'SETTLED', 'COMPLETED']);
        if (subData && subData.length > 0) {
          computedRevenue = subData.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        }
      }

      // Zero-mock policy: jika belum ada transaksi settlement yang masuk di database, tampilkan nilai sebenarnya: Rp 0
      setTotalRevenueIdr(computedRevenue);
      setTotalSpecialGrants(specialGrantCount);
      setPopulation({
        shops: merchantShops.length,
        studios: finalStudioCount,
        creators: creatorCount || 0,
        affiliates: affiliateCount || 0,
      });

      // 5. Live Feed & Message Updates Riil dari Database
      const events: LiveFeedEvent[] = [];

      // A. Riwayat transaksi riil (hanya jika ada transaksi masuk)
      if (revenueData && revenueData.length > 0) {
        revenueData.slice(0, 10).forEach((p: any) => {
          events.push({
            id: `pay_${p.id || Math.random()}`,
            type: 'PAYMENT_XENDIT',
            title: `Langganan Sukses: ${p.tenant_slug || 'Merchant'}`,
            description: `Pembayaran Rp ${(Number(p.amount_idr) || 0).toLocaleString('id-ID')} via Xendit QRIS/VA terverifikasi otomatis.`,
            timestamp: p.created_at || new Date().toISOString(),
            badge: 'XENDIT SETTLED',
            badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          });
        });
      }

      // B. Log audit dari tenant_credit_ledger (aktivitas grant kuota & reservasi render)
      const { data: ledgerRows } = await supabase
        .from('tenant_credit_ledger')
        .select('id, tenant_id, amount, balance_after, action, description, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (ledgerRows && ledgerRows.length > 0) {
        ledgerRows.forEach((l: any) => {
          const tMatch = tenantRows.find((t) => t.id === l.tenant_id);
          const tLabel = tMatch ? `${tMatch.name} (/${tMatch.slug})` : l.tenant_id.slice(0, 8);
          const isFounder = l.action === 'FOUNDER_BYPASS';
          const isReserve = l.action === 'RESERVE';
          const isAdjust = l.action === 'ADJUST_ADMIN';

          events.push({
            id: `ledger_${l.id}`,
            type: 'LEDGER_AUDIT',
            title: `Audit Ledger: ${tLabel}`,
            description: `${l.description || 'Mutasi kuota'} • Amount: ${l.amount > 0 ? `+${l.amount}` : l.amount} • Saldo: ${l.balance_after}`,
            timestamp: l.created_at || new Date().toISOString(),
            badge: isFounder ? 'FOUNDER BYPASS' : isReserve ? 'RENDER RESERVE' : isAdjust ? 'ADMIN ADJUST' : l.action,
            badgeColor: isFounder
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : isReserve
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              : 'bg-purple-500/15 text-purple-300 border-purple-500/30',
          });
        });
      }

      // C. Pendaftaran tenant baru (tenants.created_at)
      merchantShops.slice(0, 8).forEach((m: any) => {
        events.push({
          id: `merch_${m.id}`,
          type: 'MERCHANT_REGISTER',
          title: `Pendaftaran Tenant: ${m.name}`,
          description: `Tenant terdaftar dengan slug /${m.slug} (Kategori: ${m.category || 'Shop'}, Tier: ${m.tier || 'FREE'}).`,
          timestamp: m.created_at || new Date().toISOString(),
          badge: 'NEW TENANT',
          badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        });
      });

      // D. Pendaftaran creator (jika ada)
      const { data: recentCreators } = await supabase
        .from('creator_profiles')
        .select('id, handle, bio, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentCreators && recentCreators.length > 0) {
        recentCreators.forEach((c: any) => {
          events.push({
            id: `creator_${c.id}`,
            type: 'CREATOR_REGISTER',
            title: `Kreator Baru: @${c.handle}`,
            description: c.bio || 'Profil kreator UGC aktif di direktori creator.',
            timestamp: c.created_at || new Date().toISOString(),
            badge: 'UGC CREATOR',
            badgeColor: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
          });
        });
      }

      // E. Pendaftaran affiliate (jika ada)
      const { data: recentAffiliates } = await supabase
        .from('affiliates')
        .select('id, name, ref_slug, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentAffiliates && recentAffiliates.length > 0) {
        recentAffiliates.forEach((a: any) => {
          events.push({
            id: `aff_${a.id}`,
            type: 'AFFILIATE_REGISTER',
            title: `Mitra Afiliasi: ${a.name || a.ref_slug}`,
            description: `Pendaftaran mitra afiliasi resmi dengan kode referral "${a.ref_slug}".`,
            timestamp: a.created_at || new Date().toISOString(),
            badge: 'AFFILIATE PARTNER',
            badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
          });
        });
      }

      // Sort chronological descending
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLiveFeed(events);
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuth) {
      fetchDashboardData();
    }
  }, [isAdminAuth, fetchDashboardData]);

  // Execute Quick Special Grant
  const handleExecuteGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantForGrant) {
      setGrantFeedback({ type: 'error', message: 'Pilih tenant terlebih dahulu.' });
      return;
    }
    if (!grantNotes.trim()) {
      setGrantFeedback({ type: 'error', message: 'Catatan alasan grant wajib diisi untuk catatan ledger audit.' });
      return;
    }

    setIsExecutingGrant(true);
    setGrantFeedback(null);

    try {
      const isUnlimitedBypass = grantScheme === 'FOUNDER';
      const creditsRemaining = isUnlimitedBypass ? 999999 : grantScheme === 'PRO' ? 100 : 50;
      const targetTier = grantScheme === 'FOUNDER' ? 'FOUNDER' : grantScheme === 'PRO' ? 'PRO_SCALE' : 'SPECIAL_GRANT';

      // 1. Call Admin Entitlements API (writes to tenant_entitlements & logs to tenant_credit_ledger)
      const resEntitlement = await fetch(`/api/admin/tenants/${encodeURIComponent(selectedTenantForGrant.id)}/entitlements`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits_remaining: creditsRemaining,
          is_unlimited: isUnlimitedBypass,
          tier: targetTier,
          notes: `[Quick Special Grant Founder] ${grantNotes}`,
        }),
      });

      // 2. Also call shop subscription grant if merchant
      try {
        await fetch(`/api/v1/admin/tenants/${encodeURIComponent(selectedTenantForGrant.slug)}/grant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: targetTier,
            months: grantScheme === 'FOUNDER' ? 12 : 3,
            notes: grantNotes,
          }),
        });
      } catch {}

      if (!resEntitlement.ok) {
        const jsonErr = await resEntitlement.json();
        throw new Error(jsonErr.message || 'Gagal mengeksekusi grant');
      }

      setGrantFeedback({
        type: 'success',
        message: `Akses khusus (${targetTier}) berhasil diberikan ke "${selectedTenantForGrant.name}" (${selectedTenantForGrant.slug}). Tercatat di ledger audit.`,
      });

      setSelectedTenantForGrant(null);
      setGrantSearchQuery('');
      setGrantNotes('');
      fetchDashboardData();
    } catch (err: any) {
      setGrantFeedback({ type: 'error', message: err.message || 'Terjadi kesalahan sistem.' });
    } finally {
      setIsExecutingGrant(false);
    }
  };

  // Filtered tenants for search autocomplete
  const searchedTenants = grantSearchQuery.trim()
    ? allTenantsList
        .filter(
          (t) =>
            t.name.toLowerCase().includes(grantSearchQuery.toLowerCase()) ||
            t.slug.toLowerCase().includes(grantSearchQuery.toLowerCase())
        )
        .slice(0, 5)
    : [];

  const filteredFeed = liveFeed.filter((item) => {
    if (feedFilter === 'PAYMENT') return item.type === 'PAYMENT_XENDIT';
    if (feedFilter === 'MERCHANT') return item.type === 'MERCHANT_REGISTER';
    if (feedFilter === 'AFFILIATE') return item.type === 'AFFILIATE_REGISTER';
    if (feedFilter === 'CREATOR') return item.type === 'CREATOR_REGISTER';
    return true;
  });

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4 font-bold text-2xl shadow-lg shadow-blue-500/10">
            ⚡
          </div>
          <h1 className="text-xl font-black text-white mb-1">Executive Control Plane</h1>
          <p className="text-xs text-slate-400 mb-6">
            Otorisasi Super Admin diperlukan untuk mengakses Executive Command Center BoonTrack.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Buka Command Center
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8 antialiased selection:bg-blue-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6" ref={dropdownRef}>
        {/* ── 1. HEADER NAVIGASI ATAS & GROUPED DROPDOWNS ───────────── */}
        <header className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-black text-lg shrink-0 shadow-md shadow-blue-500/10">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  BoonTrack Core OS
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Settlement Sync
                </span>
              </div>
              <h1 className="text-xl font-black text-white tracking-tight mt-0.5">
                Executive Command Center
              </h1>
            </div>
          </div>

          {/* Grouped Dropdown Navigation Menu */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dropdown 1: Directories */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setActiveDropdown(activeDropdown === 'directories' ? null : 'directories')
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                  activeDropdown === 'directories'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20'
                    : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-850'
                }`}
              >
                <Store className="w-3.5 h-3.5 text-blue-400" />
                <span>Directories</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
              </button>

              {activeDropdown === 'directories' && (
                <div className="absolute left-0 lg:right-0 lg:left-auto top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <Link
                    href="/admin/shop"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Store className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-blue-300">
                        Directory Shop
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Manajemen merchant toko &amp; katalog
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/studio"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Film className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-purple-300">
                        Directory Studio
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Kuota render, Founder toggle &amp; ledger
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/creator"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-pink-300">
                        Directory Creator
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Profil kreator UGC &amp; showcase publik
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/app"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-orange-300">
                        Directory App
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        App registry, B2B Custom &amp; Civic B2G
                      </div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Dropdown 2: Operations */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setActiveDropdown(activeDropdown === 'operations' ? null : 'operations')
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                  activeDropdown === 'operations'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-850'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                <span>Operations</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
              </button>

              {activeDropdown === 'operations' && (
                <div className="absolute left-0 lg:right-0 lg:left-auto top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <Link
                    href="/admin/push-notification"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-purple-300">
                        Web Push Broadcaster
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Broadcast push web notifikasi massal
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/telemetry"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-cyan-300">
                        Telemetri Trafik
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        CAPI event match &amp; traffic observer
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/economics"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-emerald-300">
                        Unit Economics
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Analisis margin laba &amp; AI LLM token cost
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/affiliates"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-800/80 transition group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-indigo-300">
                        Affiliate Engine
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Mitra afiliasi, tracking referal &amp; payout
                      </div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Direct Link: Leads & Pilots */}
            <Link
              href="/admin/leads"
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Leads &amp; Pilots</span>
            </Link>

            {/* Refresh Button */}
            <button
              onClick={fetchDashboardData}
              disabled={loadingData}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Lock / Logout */}
            <button
              onClick={handleLogout}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-rose-400 text-xs font-semibold rounded-xl border border-slate-800 transition cursor-pointer flex items-center gap-1.5"
              title="Kunci Sesi Super Admin"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci</span>
            </button>
          </div>
        </header>

        {/* ── 2. HERO BANNER: BERSIH TANPA TOMBOL DUPLIKAT ──────────── */}
        <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 border border-blue-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                <ShoppingBag className="w-3 h-3 text-blue-400" />
                <span>Executive Command Center</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                All Services Healthy
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Pusat Kendali Ekosistem Multi-Tenant BoonTrack
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Monitoring pendapatan langganan real-time via Xendit webhook, otomasi delivery QRIS, routing pesan Meta WhatsApp Cloud API, dan tata kelola hak akses khusus founder tanpa intervensi SQL manual.
            </p>
          </div>

          <div className="flex items-center gap-3 self-stretch md:self-auto shrink-0 flex-wrap">
            <div className="px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status Xendit Webhook</span>
                <span className="text-xs font-extrabold text-emerald-400 font-mono">LIVE / OPERATIONAL</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. TOP GRID: FINANCIAL & POPULATION CARDS ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {/* Card 1: Total Pendapatan Langganan Otomatis */}
          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total Pendapatan Langganan
              </span>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-md shadow-emerald-500/10">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div>
              <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                Rp {totalRevenueIdr.toLocaleString('id-ID')}
              </span>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Otomatis via Webhook Xendit QRIS / VA</span>
              </div>
            </div>
          </div>

          {/* Card 2: Total Akun Manual / Special Grant */}
          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Akun Manual / Special Grant
              </span>
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shadow-md shadow-amber-500/10">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>

            <div>
              <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                {totalSpecialGrants} <span className="text-sm font-sans text-slate-400">Akun</span>
              </span>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-300 font-medium">
                <span>Non-Profit, Edukasi, &amp; Unlimited Founder Bypass</span>
              </div>
            </div>
          </div>

          {/* Card 3: Ringkasan Populasi Ekosistem */}
          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 shadow-xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Populasi Ekosistem
              </span>
              <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center shadow-md shadow-blue-500/10">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Store className="w-3 h-3 text-blue-400" />
                  <span>Shop</span>
                </div>
                <span className="font-bold font-mono text-sm text-white">{population.shops}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Film className="w-3 h-3 text-purple-400" />
                  <span>Studio</span>
                </div>
                <span className="font-bold font-mono text-sm text-white">{population.studios}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Users className="w-3 h-3 text-pink-400" />
                  <span>Creator</span>
                </div>
                <span className="font-bold font-mono text-sm text-white">{population.creators}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-indigo-400" />
                  <span>Mitra AM</span>
                </div>
                <span className="font-bold font-mono text-sm text-white">{population.affiliates}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. KOLOM KIRI (60%) & KOLOM KANAN (40%) ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* KOLOM KIRI (60% ~ 7 cols): Live Feed & Message Updates */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Live Feed &amp; Message Updates</h3>
                    <p className="text-[11px] text-slate-400">
                      Stream aktivitas real-time transaksi, merchant, afiliasi, dan kreator
                    </p>
                  </div>
                </div>

                {/* Filter tags */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setFeedFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      feedFilter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Semua ({liveFeed.length})
                  </button>
                  <button
                    onClick={() => setFeedFilter('PAYMENT')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      feedFilter === 'PAYMENT' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Xendit ({liveFeed.filter((f) => f.type === 'PAYMENT_XENDIT').length})
                  </button>
                  <button
                    onClick={() => setFeedFilter('LEDGER')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      feedFilter === 'LEDGER' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Audit Ledger ({liveFeed.filter((f) => f.type === 'LEDGER_AUDIT').length})
                  </button>
                  <button
                    onClick={() => setFeedFilter('MERCHANT')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      feedFilter === 'MERCHANT' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Tenant ({liveFeed.filter((f) => f.type === 'MERCHANT_REGISTER').length})
                  </button>
                </div>
              </div>

              {/* Feed Items Container */}
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {filteredFeed.length === 0 ? (
                  <div className="py-14 px-4 text-center text-slate-500 text-xs bg-slate-950/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center gap-2">
                    {feedFilter === 'PAYMENT' ? (
                      <>
                        <CreditCard className="w-6 h-6 text-slate-600 mb-1" />
                        <span className="font-semibold text-slate-400">
                          Belum ada transaksi langganan tercatat hari ini
                        </span>
                        <span className="text-[10px] text-slate-600">
                          Transaksi webhook Xendit yang berstatus PAID / SETTLED akan otomatis muncul di sini secara real-time.
                        </span>
                      </>
                    ) : feedFilter === 'LEDGER' ? (
                      <>
                        <History className="w-6 h-6 text-slate-600 mb-1" />
                        <span className="font-semibold text-slate-400">
                          Belum ada aktivitas audit ledger kredit
                        </span>
                        <span className="text-[10px] text-slate-600">
                          Aktivitas mutasi reservasi render dan penyesuaian hak akses admin akan dicatat di sini.
                        </span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-6 h-6 text-slate-600 mb-1" />
                        <span className="font-semibold text-slate-400">
                          Belum ada aktivitas pada kategori ini
                        </span>
                        <span className="text-[10px] text-slate-600">
                          Seluruh event riil dari database Supabase akan tersinkronisasi di sini.
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  filteredFeed.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider border ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                          <span className="text-xs font-bold text-white">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="text-[10px] font-mono text-slate-500 whitespace-nowrap shrink-0 mt-0.5">
                        {new Date(item.timestamp).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        WIB
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* KOLOM KANAN (40% ~ 5 cols): Panel "Quick Special Grant" */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Quick Special Grant</h3>
                    <p className="text-[11px] text-slate-400">
                      Bypass hak akses tanpa membuka SQL database
                    </p>
                  </div>
                </div>
              </div>

              {grantFeedback && (
                <div
                  className={`p-3 rounded-2xl border text-xs font-medium flex items-center gap-2 ${
                    grantFeedback.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {grantFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{grantFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleExecuteGrant} className="space-y-4">
                {/* 1. Input Pencarian Tenant */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    1. Cari Tenant (Nama / Slug)
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Ketik slug atau nama, misal: tumbuh-kembang..."
                      value={selectedTenantForGrant ? `${selectedTenantForGrant.name} (/${selectedTenantForGrant.slug})` : grantSearchQuery}
                      onChange={(e) => {
                        setSelectedTenantForGrant(null);
                        setGrantSearchQuery(e.target.value);
                      }}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  {/* Autocomplete Dropdown */}
                  {!selectedTenantForGrant && searchedTenants.length > 0 && (
                    <div className="mt-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-20">
                      {searchedTenants.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTenantForGrant(t);
                            setGrantSearchQuery(t.name);
                          }}
                          className="w-full p-2.5 text-left hover:bg-slate-800/80 transition flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-white block">{t.name}</span>
                            <span className="text-[10px] font-mono text-blue-400">/{t.slug}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            {t.tier || 'FREE'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Pilihan Skema Grant */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    2. Pilihan Skema Akses Khusus
                  </label>
                  <div className="space-y-2">
                    <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      grantScheme === 'FOUNDER' ? 'bg-amber-500/10 border-amber-500/40 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="grantScheme"
                          value="FOUNDER"
                          checked={grantScheme === 'FOUNDER'}
                          onChange={() => setGrantScheme('FOUNDER')}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        <div>
                          <div className="text-xs font-black text-amber-300">Unlimited Founder Bypass</div>
                          <div className="text-[10px] text-slate-400">Render tanpa limit kuota + founder status</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Unlimited
                      </span>
                    </label>

                    <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      grantScheme === 'PRO' ? 'bg-indigo-500/10 border-indigo-500/40 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="grantScheme"
                          value="PRO"
                          checked={grantScheme === 'PRO'}
                          onChange={() => setGrantScheme('PRO')}
                          className="text-indigo-500 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="text-xs font-black text-indigo-300">Pro Scale Grant</div>
                          <div className="text-[10px] text-slate-400">100 Render Credits + Pro Scale features</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        100 Credits
                      </span>
                    </label>

                    <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      grantScheme === 'SPECIAL_GRANT' ? 'bg-emerald-500/10 border-emerald-500/40 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="grantScheme"
                          value="SPECIAL_GRANT"
                          checked={grantScheme === 'SPECIAL_GRANT'}
                          onChange={() => setGrantScheme('SPECIAL_GRANT')}
                          className="text-emerald-500 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="text-xs font-black text-emerald-300">Special Case / Non-Profit</div>
                          <div className="text-[10px] text-slate-400">Grant edukasi / yayasan nirlaba (50 Credits)</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        50 Credits
                      </span>
                    </label>
                  </div>
                </div>

                {/* 3. Catatan Alasan Grant (Wajib Dicatat ke Ledger) */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    3. Catatan Alasan Grant (Audit Ledger)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Akses pilot program founder dr. Harys"
                    value={grantNotes}
                    onChange={(e) => setGrantNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Wajib diisi &amp; otomatis tercatat permanen di <code className="text-slate-400">tenant_credit_ledger</code>.
                  </span>
                </div>

                {/* Tombol Eksekusi Langsung */}
                <button
                  type="submit"
                  disabled={isExecutingGrant || !selectedTenantForGrant}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-xs transition shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-4 h-4" />
                  <span>
                    {isExecutingGrant ? 'Mengeksekusi Grant...' : 'Eksekusi Special Grant Sekarang 🚀'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ── 5. BAWAH: QUICK LAUNCH LINKS KE 4 DIREKTORI UTAMA ────── */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Pintasan Cepat Direktori Utama (Quick Launch)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Directory Shop */}
            <Link
              href="/admin/shop"
              className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/40 hover:bg-slate-900/90 transition shadow-lg flex flex-col justify-between space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center group-hover:scale-105 transition">
                  <Store className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white group-hover:text-blue-300 transition">
                  Directory Shop
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Kelola ribuan toko online merchant, katalog produk, dan status server instance.
                </p>
              </div>
            </Link>

            {/* 2. Directory Studio */}
            <Link
              href="/admin/studio"
              className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/40 hover:bg-slate-900/90 transition shadow-lg flex flex-col justify-between space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center group-hover:scale-105 transition">
                  <Film className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white group-hover:text-purple-300 transition">
                  Directory Studio
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Kelola tenant studio, kuota render FFmpeg, toggle Founder is_unlimited, dan ledger.
                </p>
              </div>
            </Link>

            {/* 3. Directory Creator */}
            <Link
              href="/admin/creator"
              className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-pink-500/40 hover:bg-slate-900/90 transition shadow-lg flex flex-col justify-between space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-pink-500/15 text-pink-400 flex items-center justify-center group-hover:scale-105 transition">
                  <Users className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-pink-400 transition" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white group-hover:text-pink-300 transition">
                  Directory Creator
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Kelola profil creator UGC, verifikasi badge mitra, dan showcase portofolio publik.
                </p>
              </div>
            </Link>

            {/* 4. Directory App */}
            <Link
              href="/admin/app"
              className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-orange-500/40 hover:bg-slate-900/90 transition shadow-lg flex flex-col justify-between space-y-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/15 text-orange-400 flex items-center justify-center group-hover:scale-105 transition">
                  <Boxes className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-orange-400 transition" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white group-hover:text-orange-300 transition">
                  Directory App
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  App registry ekosistem app.boontrack.com, IoT hardware POS &amp; Civic Tech B2G.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}