'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Store,
  Search,
  ExternalLink,
  Sliders,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Wrench,
  Briefcase,
  Utensils,
  ArrowLeft,
  Bell,
  Activity,
  DollarSign,
  MessageSquare,
  Building2,
  CheckCircle2,
  Video,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import GrantAccessModal from '@/app/admin/components/GrantAccessModal';
import { getRemainingDays } from '@/lib/subscription-tiers';

const MASTER_PIN = '998877';

export type VerticalFilterKey =
  | 'ALL'
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'CREATOR'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'FOOD_BEVERAGE';

interface VerticalDef {
  key: VerticalFilterKey;
  label: string;
  badge: string;
  color: string;
  activeColor: string;
  icon: React.ElementType;
}

const VERTICAL_TABS: VerticalDef[] = [
  {
    key: 'ALL',
    label: 'SEMUA',
    badge: 'Semua Merchant',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30',
    icon: Store,
  },
  {
    key: 'PHYSICAL',
    label: 'PHYSICAL',
    badge: 'Retail Fisik',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30',
    icon: ShoppingBag,
  },
  {
    key: 'DIGITAL',
    label: 'DIGITAL',
    badge: 'Digital & E-Course',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30',
    icon: Sparkles,
  },
  {
    key: 'CREATOR',
    label: 'CREATOR',
    badge: 'Creator Commerce (Affiliate, Video, Merch)',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-pink-600 text-white border-pink-500 shadow-md shadow-pink-600/30',
    icon: Video,
  },
  {
    key: 'FIELD_SERVICE',
    label: 'FIELD_SERVICE',
    badge: 'Jasa & Teknisi',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-600/30',
    icon: Wrench,
  },
  {
    key: 'PROFESSIONAL_SERVICE',
    label: 'PROFESSIONAL_SERVICE',
    badge: 'Profesional & Edukasi',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30',
    icon: Briefcase,
  },
  {
    key: 'FOOD_BEVERAGE',
    label: 'FOOD_BEVERAGE',
    badge: 'F&B / Kuliner',
    color: 'border-slate-800 text-slate-400 bg-slate-900/60 hover:bg-slate-850',
    activeColor: 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30',
    icon: Utensils,
  },
];

function resolveShopVertical(
  t: any
): 'PHYSICAL' | 'DIGITAL' | 'CREATOR' | 'FIELD_SERVICE' | 'PROFESSIONAL_SERVICE' | 'FOOD_BEVERAGE' {
  const rawCat = (
    t.metadata?.business_type ||
    t.metadata?.vertical_type ||
    t.category ||
    t.metadata?.business_category ||
    ''
  ).toUpperCase();

  if (
    [
      'CREATOR',
      'CREATOR_COMMERCE',
      'CREATOR_SERVICE',
      'CREATOR_AGENCY',
      'AFFILIATE',
      'INFLUENCER',
      'VIDEO',
      'STUDIO_LIVE',
    ].includes(rawCat)
  ) {
    return 'CREATOR';
  }
  if (['PHYSICAL', 'RETAIL', 'RETAIL_PHYSICAL', 'FASHION', 'CLOTHING'].includes(rawCat)) {
    return 'PHYSICAL';
  }
  if (
    [
      'DIGITAL',
      'EBOOK',
      'COURSE',
      'ECOURSE',
      'COMMUNITY_DAKWAH',
      'DAKWAH',
      'KAJIAN',
      'MAJELIS',
    ].includes(rawCat)
  ) {
    return 'DIGITAL';
  }
  if (['FIELD_SERVICE', 'HOME_SERVICE', 'SERVICE_AC', 'KURAS_TOREN', 'TEKNISI'].includes(rawCat)) {
    return 'FIELD_SERVICE';
  }
  if (
    [
      'PROFESSIONAL_SERVICE',
      'CONSULTING',
      'TRAVEL',
      'UMROH',
      'LEGAL',
    ].includes(rawCat)
  ) {
    return 'PROFESSIONAL_SERVICE';
  }
  if (['FOOD_BEVERAGE', 'FNB', 'KULINER', 'RESTORAN', 'CAFE'].includes(rawCat)) {
    return 'FOOD_BEVERAGE';
  }

  // Heuristic based on text content
  const text = `${t.name || ''} ${t.metadata?.bio || ''} ${t.slug || ''}`.toLowerCase();
  if (
    text.includes('video') ||
    text.includes('buatinvideo') ||
    text.includes('creator') ||
    text.includes('affiliate') ||
    text.includes('influencer') ||
    text.includes('studio live')
  ) {
    return 'CREATOR';
  }
  if (text.includes('kuras') || text.includes('toren') || text.includes('ac ') || text.includes('teknisi')) {
    return 'FIELD_SERVICE';
  }
  if (
    text.includes('kajian') ||
    text.includes('dakwah') ||
    text.includes('ads') ||
    text.includes('masterclass')
  ) {
    return 'DIGITAL';
  }
  if (text.includes('kopi') || text.includes('resto') || text.includes('food') || text.includes('kuliner') || text.includes('cafe')) {
    return 'FOOD_BEVERAGE';
  }
  if (text.includes('agency') || text.includes('consult') || text.includes('travel') || text.includes('marketing')) {
    return 'PROFESSIONAL_SERVICE';
  }

  return 'PHYSICAL';
}

function getVerticalBadge(vertical: ReturnType<typeof resolveShopVertical>) {
  switch (vertical) {
    case 'CREATOR':
      return {
        label: 'Creator Commerce',
        classes: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
        icon: Video,
      };
    case 'DIGITAL':
      return {
        label: 'Digital & E-Course',
        classes: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        icon: Sparkles,
      };
    case 'FIELD_SERVICE':
      return {
        label: 'Jasa & Teknisi',
        classes: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        icon: Wrench,
      };
    case 'PROFESSIONAL_SERVICE':
      return {
        label: 'Profesional & Edukasi',
        classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        icon: Briefcase,
      };
    case 'FOOD_BEVERAGE':
      return {
        label: 'F&B / Kuliner',
        classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        icon: Utensils,
      };
    case 'PHYSICAL':
    default:
      return {
        label: 'Retail Fisik',
        classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        icon: ShoppingBag,
      };
  }
}

export default function SuperAdminShopDirectory() {
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeVertical, setActiveVertical] = useState<VerticalFilterKey>('ALL');
  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);

  // Grant Access Modal & Quick Extension State
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [selectedShopForGrant, setSelectedShopForGrant] = useState<any | null>(null);
  const [quickExtendingSlug, setQuickExtendingSlug] = useState<string | null>(null);
  const [grantBannerMsg, setGrantBannerMsg] = useState<string | null>(null);

  // Quick Action: +1 Bulan Grant Extension
  const handleQuickExtendMonth = async (shop: any) => {
    setQuickExtendingSlug(shop.slug);
    try {
      const res = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(shop.slug)}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: shop.metadata?.subscription?.plan_tier || shop.tier || 'PRO_SCALE',
          months: 1,
          notes: 'Quick Extend +1 Bulan via Admin Table',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memperpanjang akses khusus');
      }

      setShops((prev) =>
        prev.map((s) => {
          if (s.slug === shop.slug) {
            return {
              ...s,
              tier: json.tier,
              subscription_ends_at: json.valid_until,
              metadata: {
                ...(s.metadata || {}),
                subscription: json.subscription,
                subscription_type: 'granted',
                tier: json.tier,
                selected_plan: `${json.tier_name} • Special Grant`,
                is_trial: false,
              },
            };
          }
          return s;
        })
      );

      setGrantBannerMsg(`✅ Akses khusus untuk toko "${shop.name}" berhasil diperpanjang +1 Bulan (+30 hari)!`);
      setTimeout(() => setGrantBannerMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Gagal memperpanjang akses khusus');
    } finally {
      setQuickExtendingSlug(null);
    }
  };

  const handleGrantSuccess = (json: any) => {
    setShops((prev) =>
      prev.map((s) => {
        if (s.slug === json.tenant_slug) {
          return {
            ...s,
            tier: json.tier,
            subscription_ends_at: json.valid_until,
            metadata: {
              ...(s.metadata || {}),
              subscription: json.subscription,
              subscription_type: 'granted',
              tier: json.tier,
              selected_plan: `${json.tier_name} • Special Grant`,
              is_trial: false,
            },
          };
        }
        return s;
      })
    );
    setGrantBannerMsg(`✅ Akses khusus "${json.tier_name} • Special Grant" berhasil diberikan kepada toko (${json.tenant_slug})!`);
    setTimeout(() => setGrantBannerMsg(null), 4500);
  };

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

  const fetchShops = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, tier, category, status, is_active, created_at, subscription_ends_at, metadata')
        .order('name', { ascending: true });

      if (error) {
        console.error('Failed to load tenants:', error);
        return;
      }

      // Filter strictly to SaaS / Storefront merchants (excluding archived and platform internals)
      const saasMerchants = (data || []).filter((t: any) => {
        // Exclude archived, expired, inactive stores
        if (
          t.status === 'ARCHIVED' ||
          t.metadata?.is_archived === true ||
          t.status === 'expired' ||
          t.status === 'inactive'
        ) {
          return false;
        }

        const meta = t.metadata || {};
        if (meta.is_saas === true) return true;
        if (meta.is_saas === false || meta.is_internal === true || meta.workspace_type === 'internal') {
          return false;
        }

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

      // Enrich with resolved vertical
      const enriched = saasMerchants.map((m: any) => ({
        ...m,
        resolved_vertical: resolveShopVertical(m),
      }));

      setShops(enriched);
    } catch (err) {
      console.warn('Error fetching shop directory:', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle active / suspended status
  const handleToggleStatus = async (slug: string, currentStatus: string, currentActive?: boolean) => {
    const isCurrentlyActive = currentActive !== false && currentStatus !== 'SUSPENDED';
    const nextActive = !isCurrentlyActive;
    const nextStatus = nextActive ? 'ACTIVE' : 'SUSPENDED';

    setUpdatingSlug(slug);
    // Optimistic UI update
    setShops((prev) =>
      prev.map((s) => (s.slug === slug ? { ...s, is_active: nextActive, status: nextStatus } : s))
    );

    try {
      const res = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(slug)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE_STATUS',
          is_active: nextActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengubah status toko');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status');
      fetchShops();
    } finally {
      setUpdatingSlug(null);
    }
  };

  // Archive (soft delete) shop
  const handleArchiveShop = async (slug: string, name: string) => {
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin mengarsipkan toko "${name}" (${slug})?\n\nToko akan disembunyikan dari direktori merchant (soft delete).`
    );
    if (!confirmed) return;

    setUpdatingSlug(slug);
    // Optimistic UI update: remove from directory
    setShops((prev) => prev.filter((s) => s.slug !== slug));

    try {
      const res = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(slug)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ARCHIVE',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengarsipkan toko');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mengarsipkan toko');
      fetchShops();
    } finally {
      setUpdatingSlug(null);
    }
  };

  useEffect(() => {
    if (isAdminAuth) {
      fetchShops();
    }
  }, [isAdminAuth]);

  // Filtered Shops based on active vertical tab and instant search query
  const filteredShops = shops.filter((s) => {
    const matchVertical =
      activeVertical === 'ALL' || s.resolved_vertical === activeVertical;

    const query = search.toLowerCase().trim();
    const matchSearch = query
      ? (s.name || '').toLowerCase().includes(query) ||
        (s.slug || '').toLowerCase().includes(query) ||
        (s.metadata?.whatsapp_number || '').includes(query) ||
        (s.metadata?.store_name || '').toLowerCase().includes(query)
      : true;

    return matchVertical && matchSearch;
  });

  // Vertical counts
  const verticalCounts: Record<VerticalFilterKey, number> = {
    ALL: shops.length,
    PHYSICAL: shops.filter((s) => s.resolved_vertical === 'PHYSICAL').length,
    DIGITAL: shops.filter((s) => s.resolved_vertical === 'DIGITAL').length,
    CREATOR: shops.filter((s) => s.resolved_vertical === 'CREATOR').length,
    FIELD_SERVICE: shops.filter((s) => s.resolved_vertical === 'FIELD_SERVICE').length,
    PROFESSIONAL_SERVICE: shops.filter((s) => s.resolved_vertical === 'PROFESSIONAL_SERVICE').length,
    FOOD_BEVERAGE: shops.filter((s) => s.resolved_vertical === 'FOOD_BEVERAGE').length,
  };

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl shadow-lg shadow-blue-500/10">
            🛍️
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Directory Shop Superadmin</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengakses inventaris merchant toko. Masukkan PIN Master Super Admin.
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
              title="Kembali ke Control Plane Overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  SaaS Merchant Directory
                </span>
                <span className="text-[11px] text-slate-400">&bull; shop.boontrack.com</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Directory Shop Merchants</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchShops}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              title="Refresh Data Merchant"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <Link
              href="/admin/push-notification"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-800 transition flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5 text-purple-400" />
              <span>Push Broadcaster</span>
            </Link>
            <Link
              href="/admin/telemetry"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-800 transition flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Telemetri</span>
            </Link>
            <Link
              href="/admin/economics"
              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-800 transition flex items-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Unit Economics</span>
            </Link>
          </div>
        </div>

        {/* Grant Feedback Alert Banner */}
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

        {/* Superadmin Module Navigation (Consistent Header Tabs) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Link
            href="/admin"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <span>⚡ Workspaces &amp; Incidents</span>
          </Link>
          <span className="px-3.5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-600/20 shrink-0 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-white" />
            <span>Directory Shop</span>
          </span>
          <Link
            href="/admin/push-notification"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <Bell className="w-3.5 h-3.5 text-purple-400" />
            <span>Web Push Broadcaster</span>
          </Link>
          <Link
            href="/admin/telemetry"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Telemetri Trafik</span>
          </Link>
          <Link
            href="/admin/economics"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Unit Economics</span>
          </Link>
        </div>

        {/* 6 Kancing Filter Vertikal (Pills Filter) & Search Bar Toolbar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* 6 Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none flex-wrap">
              {VERTICAL_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeVertical === tab.key;
                const count = verticalCounts[tab.key];
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveVertical(tab.key)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border cursor-pointer ${
                      isActive ? tab.activeColor : tab.color
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Instant Search Bar */}
            <div className="relative w-full lg:w-72 shrink-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari toko, slug, no WA..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-slate-300 font-bold"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">Daftar Toko Merchant</span>
              <span>&bull;</span>
              <span>
                Menampilkan <strong className="text-white">{filteredShops.length}</strong> dari{' '}
                <strong className="text-white">{shops.length}</strong> merchant
              </span>
            </div>
            {activeVertical !== 'ALL' && (
              <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Filter: {activeVertical}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Toko Merchant</th>
                  <th className="px-5 py-3.5">Kategori Vertikal</th>
                  <th className="px-5 py-3.5">Pemilik &amp; WhatsApp</th>
                  <th className="px-5 py-3.5">Plan Tier</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-center">Aksi Langsung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Mengambil database merchant dari Supabase...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredShops.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                      <Store className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="font-semibold text-white">Tidak ada toko merchant ditemukan.</p>
                      <p className="text-[11px] mt-1 text-slate-400">
                        {search ? `Tidak ada hasil pencarian untuk "${search}"` : 'Belum ada merchant di kategori ini.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredShops.map((shop) => {
                    const verticalInfo = getVerticalBadge(shop.resolved_vertical);
                    const VerticalIcon = verticalInfo.icon;
                    const waNumber =
                      shop.metadata?.whatsapp_number ||
                      shop.metadata?.whatsapp ||
                      shop.metadata?.wa_number ||
                      '-';
                    const cleanWa = waNumber.replace(/[^0-9]/g, '');
                    const ownerName =
                      shop.metadata?.store_name ||
                      shop.metadata?.owner_name ||
                      shop.metadata?.contact_name ||
                      shop.name;
                    const planTier = (shop.tier || shop.metadata?.tier || 'STARTER').toUpperCase();

                    return (
                      <tr key={shop.id || shop.slug} className="hover:bg-slate-850/40 transition">
                        {/* 1. Toko Merchant */}
                        <td className="px-5 py-4 font-bold text-white">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-black text-xs">
                              {shop.name?.charAt(0)?.toUpperCase() || 'S'}
                            </div>
                            <div>
                              <span className="block text-sm font-bold text-white leading-snug">
                                {shop.name}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 font-normal">
                                shop.boontrack.com/{shop.slug}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Kategori Vertikal */}
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${verticalInfo.classes}`}
                          >
                            <VerticalIcon className="w-3 h-3" />
                            <span>{verticalInfo.label}</span>
                          </span>
                        </td>

                        {/* 3. Pemilik & WhatsApp */}
                        <td className="px-5 py-4 text-slate-300">
                          <div className="font-semibold text-xs text-white leading-tight">
                            {ownerName}
                          </div>
                          {cleanWa ? (
                            <a
                              href={`https://wa.me/${cleanWa.startsWith('0') ? '62' + cleanWa.slice(1) : cleanWa}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 mt-0.5"
                            >
                              <MessageSquare className="w-2.5 h-2.5" />
                              <span>{waNumber}</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono">-</span>
                          )}
                        </td>

                        {/* 4. Plan Tier */}
                        <td className="px-5 py-4">
                          {(() => {
                            const isGrant = Boolean(
                              shop.metadata?.subscription?.type === 'granted' ||
                                shop.metadata?.subscription?.subscription_type === 'granted' ||
                                shop.metadata?.subscription_type === 'granted' ||
                                shop.metadata?.subscription?.is_grant
                            );

                            const validUntil =
                              shop.metadata?.subscription?.valid_until ||
                              shop.subscription_ends_at ||
                              shop.metadata?.subscription_ends_at;

                            const days = validUntil ? getRemainingDays(validUntil) : null;

                            if (isGrant) {
                              return (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-amber-500/15 text-amber-300 border-amber-500/40">
                                    <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                    <span>{planTier} • SPECIAL GRANT</span>
                                  </span>
                                  {validUntil && (
                                    <span className="block text-[10px] font-mono text-slate-400">
                                      {days !== null && days > 0
                                        ? `Sisa ${days} hari`
                                        : 'Kedaluwarsa'}
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                  planTier.includes('ENTERPRISE')
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                    : planTier.includes('PRO')
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                    : planTier.includes('GROWTH')
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                }`}
                              >
                                {planTier}
                              </span>
                            );
                          })()}
                        </td>

                        {/* 5. Status: Interactive Toggle (ACTIVE / SUSPENDED) */}
                        <td className="px-5 py-4">
                          {(() => {
                            const isActive = shop.is_active !== false && shop.status !== 'SUSPENDED';
                            const isUpdating = updatingSlug === shop.slug;
                            return (
                              <button
                                onClick={() => handleToggleStatus(shop.slug, shop.status, shop.is_active)}
                                disabled={isUpdating}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer disabled:opacity-50 ${
                                  isActive
                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                                }`}
                                title={`Klik untuk mengubah status ke ${isActive ? 'SUSPENDED' : 'ACTIVE'}`}
                              >
                                {isUpdating ? (
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                                    }`}
                                  />
                                )}
                                <span>{isActive ? 'ACTIVE' : 'SUSPENDED'}</span>
                              </button>
                            );
                          })()}
                        </td>

                        {/* 6. Aksi Langsung */}
                        <td className="px-5 py-4 text-center">
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                            {/* Quick Action: +1 Bulan Grant Extension */}
                            <button
                              onClick={() => handleQuickExtendMonth(shop)}
                              disabled={quickExtendingSlug === shop.slug}
                              className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                              title="Perpanjangan Cepat Akses Khusus +1 Bulan (30 Hari)"
                            >
                              {quickExtendingSlug === shop.slug ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 text-amber-400" />
                                  <span>+1 Bulan</span>
                                </>
                              )}
                            </button>

                            {/* Modal Trigger: Beri Akses Khusus */}
                            <button
                              onClick={() => {
                                setSelectedShopForGrant(shop);
                                setGrantModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                              title="Beri Akses Khusus (Grant Access) / Atur Tier"
                            >
                              <ShieldCheck className="w-3 h-3 text-indigo-400" />
                              <span>Grant</span>
                            </button>

                            <a
                              href={`/${shop.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-[11px] inline-flex items-center gap-1 font-semibold transition border border-slate-700 cursor-pointer"
                              title="Buka Etalase Storefront Publik"
                            >
                              <Store className="w-3 h-3 text-blue-400" />
                              <span>Etalase</span>
                              <ExternalLink className="w-2.5 h-2.5 text-slate-500" />
                            </a>
                            <Link
                              href={`/admin/shops/${shop.slug}/config`}
                              className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-xl text-[11px] inline-flex items-center gap-1 font-semibold transition border border-blue-500/30 cursor-pointer"
                              title="Edit Konfigurasi Payment & Ongkir Toko"
                            >
                              <Sliders className="w-3 h-3 text-blue-400" />
                              <span>Konfigurasi</span>
                            </Link>
                            <button
                              onClick={() => handleArchiveShop(shop.slug, shop.name)}
                              disabled={updatingSlug === shop.slug}
                              className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700 hover:border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                              title="Arsipkan Toko (Soft Delete)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      </div>

      {/* Modal Beri Akses Khusus (Grant Access) */}
      <GrantAccessModal
        isOpen={grantModalOpen}
        onClose={() => setGrantModalOpen(false)}
        shop={selectedShopForGrant}
        onSuccess={handleGrantSuccess}
      />
    </main>
  );
}