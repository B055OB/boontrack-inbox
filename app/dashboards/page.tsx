'use client';

/**
 * /dashboards — Showcase Clone (Screenshot / Ads Asset for Mas Sakti)
 * Pixel-perfect replica of [tenant]/dashboard layout — Buzzer UKM identity
 * Tier: Paket Scale • Unlimited (NO trial banners)
 * Zero Supabase / Zero API / Pure static mock data
 *
 * Mock: CTWA Mastery 7-Day Intensive
 * Midnight order angle: "Bangun Tidur Banjir Order" (22–23 Sep 2026)
 */

import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  MessageSquare,
  Brain,
  Target,
  Radio,
  Package,
  Palette,
  CreditCard,
  ExternalLink,
  Store,
  Copy,
  Check,
  ChevronRight,
  TrendingUp,
  Eye,
  Receipt,
  Wallet,
  Zap,
  CheckCircle2,
  QrCode,
  ArrowRight,
  Menu,
  X,
  Sun,
  Moon,
  ChevronsUpDown,
  User,
  Crown,
  Globe,
  LogOut,
  Filter,
  ChevronDown,
  Server,
  CheckCircle,
  Activity,
  Share2,
  FolderKey,
  Sparkles,
  Download,
  Smartphone,
  Lock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// MOCK IDENTITY — Buzzer UKM / Scale Tier
// ─────────────────────────────────────────────────────────────
const STORE = {
  name: 'Buzzer UKM',
  slug: 'buzzerukm',
  initial: 'B',
  tier: 'Paket Scale',
  tierBadge: 'Scale • Unlimited',
  bioUrl: 'https://boontrack.com/buzzerukm',
};

// ─────────────────────────────────────────────────────────────
// MOCK METRICS
// ─────────────────────────────────────────────────────────────
type DateRange = '7' | '30' | 'all';

const METRICS: Record<DateRange, { rev: number; ord: number; spend: number; roas: number; cpa: number; cr: number }> = {
  '7':  { rev: 74_318_000,  ord: 672,   spend: 10_800_000, roas: 6.88, cpa: 16_072, cr: 18.1 },
  '30': { rev: 318_483_000, ord: 2_940,  spend: 46_200_000, roas: 6.89, cpa: 15_714, cr: 18.4 },
  'all':{ rev: 541_722_000, ord: 5_081,  spend: 78_900_000, roas: 6.87, cpa: 15_530, cr: 18.6 },
};

// ─────────────────────────────────────────────────────────────
// MIDNIGHT ORDERS — "Bangun Tidur Banjir Order"
// ─────────────────────────────────────────────────────────────
const ORDERS = [
  { id: '#BT-3042', ts: '23 Sep, 05:14', buyer: 'Ahmad F****',  product: 'CTWA Mastery 7-Day',      amount: 99_000,  method: 'QRIS Mandiri',      status: 'PAID' },
  { id: '#BT-3041', ts: '23 Sep, 04:48', buyer: 'Dedi K****',   product: 'CTWA Mastery VIP (Upsell)', amount: 149_000, method: 'BCA Transfer',      status: 'PAID' },
  { id: '#BT-3040', ts: '23 Sep, 04:12', buyer: 'Siti N****',   product: 'CTWA Mastery 7-Day',      amount: 99_000,  method: 'QRIS BCA',          status: 'PAID' },
  { id: '#BT-3039', ts: '23 Sep, 03:35', buyer: 'Budi S****',   product: 'CTWA Mastery 7-Day',      amount: 99_000,  method: 'QRIS ShopeePay',    status: 'PAID' },
  { id: '#BT-3038', ts: '23 Sep, 02:50', buyer: 'Hendra W****', product: 'CTWA Mastery VIP',        amount: 149_000, method: 'BCA Transfer',      status: 'PAID' },
  { id: '#BT-3037', ts: '23 Sep, 01:15', buyer: 'Rina M****',   product: 'CTWA Mastery 7-Day',      amount: 99_000,  method: 'QRIS Mandiri',      status: 'PAID' },
  { id: '#BT-3036', ts: '22 Sep, 23:45', buyer: 'Farhan R****', product: 'CTWA Mastery 7-Day',      amount: 99_000,  method: 'QRIS GoPay',        status: 'PAID' },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function fmtRp(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} Jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

// ─────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data), min = Math.min(...data);
  const W = 72, H = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / (max - min + 1)) * H;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="opacity-60">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// REVENUE AREA CHART
// ─────────────────────────────────────────────────────────────
function genRevData(days: number) {
  const seed = [9.2,11.5,8.7,13.8,10.1,12.3,14.1,9.6,11.2,8.4,13.5,10.9,12.7,9.3,11.8,14.6,8.9,10.5,13.2,11.1,9.8,12.4,10.3,13.9,8.6,11.6,14.2,9.4,10.8,12.1];
  return Array.from({ length: days }, (_, i) => seed[i % seed.length] * 1_000_000);
}

function RevenueChart({ days }: { days: number }) {
  const data = useMemo(() => genRevData(days), [days]);
  const W = 860, H = 160, PL = 64, PR = 16, PT = 12, PB = 32;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxV = 16_000_000;
  const toX = (i: number) => PL + (i / (data.length - 1)) * cW;
  const toY = (v: number) => PT + cH - (v / maxV) * cH;
  const line = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const area = [`${toX(0)},${PT + cH}`, ...data.map((v, i) => `${toX(i)},${toY(v)}`), `${toX(data.length - 1)},${PT + cH}`].join(' ');
  const yTicks = [0, 5_000_000, 10_000_000, 15_000_000];
  const skip = days <= 7 ? 1 : days <= 30 ? 5 : 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 160 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
          <text x={PL - 6} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {v === 0 ? '0' : `${(v / 1_000_000).toFixed(0)}Jt`}
          </text>
        </g>
      ))}
      <polygon points={area} fill="url(#revGrad)" />
      <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={toX(i)} cy={toY(v)} r="2.5" fill="#6366f1" stroke="white" strokeWidth="1.2" />
      ))}
      {data.map((_, i) =>
        i % skip === 0 ? (
          <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">H{i + 1}</text>
        ) : null
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR — Exact production structure
// ─────────────────────────────────────────────────────────────
type ActiveTab = 'dashboard' | 'catalog' | 'downloads' | 'themes' | 'ai_knowledge' | 'whatsapp' | 'inbox' | 'ads_tracking' | 'finance' | 'orders';

function Sidebar({
  activeTab,
  setActiveTab,
  className = '',
  onClose,
}: {
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  className?: string;
  onClose?: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleTab = (t: ActiveTab) => {
    setActiveTab(t);
    onClose?.();
  };

  const isMainActive = (t: string) =>
    t === 'dashboard'
      ? activeTab === 'dashboard'
      : activeTab === t;

  const accentLine: Record<string, string> = {
    dashboard: 'bg-indigo-600', catalog: 'bg-indigo-600', downloads: 'bg-indigo-600',
    themes: 'bg-indigo-600', ai_knowledge: 'bg-indigo-600',
    whatsapp: 'bg-indigo-600', inbox: 'bg-indigo-600', ads_tracking: 'bg-indigo-600',
    finance: 'bg-indigo-600', orders: 'bg-emerald-600',
  };

  function NavBtn({
    tab, label, iconBg, iconColor, icon: Icon, badge, badgeCls, isOrders,
  }: {
    tab: ActiveTab; label: string; iconBg: string; iconColor: string;
    icon: React.ElementType; badge?: string; badgeCls?: string; isOrders?: boolean;
  }) {
    const active = isMainActive(tab);
    return (
      <button
        type="button"
        onClick={() => handleTab(tab)}
        className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
          active
            ? isOrders
              ? 'bg-emerald-50/80 text-emerald-900 font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
              : 'bg-indigo-50/80 text-indigo-900 font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
        }`}
      >
        {active && (
          <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 ${accentLine[tab]} rounded-r`} />
        )}
        <div className="flex items-center gap-2.5 truncate">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${iconBg} ${iconColor}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="truncate">{label}</span>
        </div>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold shrink-0 ${badgeCls ?? 'bg-slate-100 text-slate-600'}`}>
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className={`w-64 xl:w-72 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col justify-between shrink-0 select-none z-40 ${className}`}>

      {/* ── TOP: Store profile card ── */}
      <div className="p-3 border-b border-slate-100 relative bg-white">
        <button
          type="button"
          onClick={() => setPopoverOpen(p => !p)}
          className={`w-full flex items-center justify-between p-2 rounded-2xl border transition cursor-pointer text-left ${
            popoverOpen
              ? 'bg-slate-50 border-indigo-400 shadow-sm ring-2 ring-indigo-500/10'
              : 'bg-white hover:bg-slate-50/90 border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
              {STORE.initial}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-black text-slate-900 truncate block">{STORE.name}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {/* Scale tier badge — green/blue solid, NO trial */}
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-[1px] rounded-full border leading-tight bg-emerald-50 text-emerald-800 border-emerald-300">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block" />
                  {STORE.tierBadge}
                </span>
              </div>
            </div>
          </div>
          <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
        </button>

        {/* Popover */}
        {popoverOpen && (
          <div className="absolute top-full left-3 right-3 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 z-50">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-black text-slate-900 truncate">{STORE.name}</p>
              <p className="text-[10px] font-semibold text-slate-400 truncate">boontrack.com/{STORE.slug}</p>
            </div>
            {[
              { icon: User,  label: 'Akun & Profil Toko',   cls: 'text-slate-700 hover:bg-slate-50' },
              { icon: Crown, label: 'Billing & Langganan',   cls: 'text-purple-700 hover:bg-purple-50' },
              { icon: Globe, label: 'Pengaturan Domain',     cls: 'text-slate-700 hover:bg-slate-50' },
            ].map(m => (
              <button key={m.label} type="button" onClick={() => setPopoverOpen(false)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition text-left cursor-pointer ${m.cls}`}>
                <m.icon className="w-3.5 h-3.5" /><span>{m.label}</span>
              </button>
            ))}
            <div className="h-px bg-slate-100 my-1" />
            <button type="button" onClick={() => setPopoverOpen(false)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer">
              <LogOut className="w-3.5 h-3.5 text-rose-500" /><span>Keluar (Logout)</span>
            </button>
          </div>
        )}

        {/* View storefront quick link */}
        <div className="mt-2">
          <div
            onClick={() => handleTab('dashboard')}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 text-slate-600 hover:text-indigo-600 text-[11px] font-bold transition group shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              <Store className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
              <span className="truncate">Lihat Tampilan Toko</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 shrink-0" />
          </div>
        </div>
      </div>

      {/* ── MIDDLE: Navigation ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4" style={{ scrollbarWidth: 'none' }}>

        {/* GROUP 1: STORE ENGINE */}
        <div>
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase px-3 pt-1 pb-2 block">
            STORE ENGINE
          </span>
          <div className="space-y-0.5">
            <NavBtn tab="dashboard"    label="Dashboard"            icon={LayoutDashboard} iconBg="bg-indigo-50"  iconColor="text-indigo-600" />
            <NavBtn tab="catalog"      label="Produk & Materi"      icon={Package}         iconBg="bg-sky-50"    iconColor="text-sky-600"    badge="UTAMA" badgeCls="bg-sky-50 text-sky-700 border border-sky-200 uppercase" />
            <NavBtn tab="downloads"    label="Akses Unduh & Lisensi" icon={FolderKey}       iconBg="bg-indigo-50" iconColor="text-indigo-600" badge="AKSES" badgeCls="bg-slate-100 text-slate-600 uppercase" />
            <NavBtn tab="themes"       label="Tampilan & Tema"      icon={Palette}         iconBg="bg-purple-50" iconColor="text-purple-600" badge="TEMA" badgeCls="bg-purple-100 text-purple-700 border border-purple-200 uppercase" />
            <NavBtn tab="ai_knowledge" label="AI Knowledge & Bot"   icon={Brain}           iconBg="bg-violet-50" iconColor="text-violet-600" badge="AI"   badgeCls="bg-violet-100 text-violet-700 border border-violet-200 uppercase" />
          </div>
        </div>

        {/* GROUP 2: GROWTH & CONVERSIONS */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase px-3 pt-2 pb-2 block">
            GROWTH & CONVERSIONS
          </span>
          <div className="space-y-0.5">
            <NavBtn tab="whatsapp"     label="WhatsApp & Broadcast" icon={Radio}       iconBg="bg-emerald-50" iconColor="text-emerald-600" badge="CONNECTED" badgeCls="bg-emerald-100 text-emerald-800 border border-emerald-200" />
            <NavBtn tab="inbox"        label="BoonTrack Inbox"      icon={MessageSquare} iconBg="bg-indigo-50" iconColor="text-indigo-600" badge="10 Baru"   badgeCls="bg-blue-100 text-blue-800 border border-blue-200" />
            <NavBtn tab="ads_tracking" label="Ads Tracking Pro"     icon={Target}      iconBg="bg-amber-50"   iconColor="text-amber-600"   badge="CAPI"     badgeCls="bg-blue-50 text-blue-700 border border-blue-200 uppercase" />
            <NavBtn tab="finance"      label="Laporan Keuangan"     icon={CreditCard}  iconBg="bg-slate-100"  iconColor="text-slate-700" />
            <NavBtn tab="orders"       label="Pesanan & Order"      icon={ShoppingBag} iconBg="bg-emerald-50" iconColor="text-emerald-600" badge="2.940" badgeCls="bg-emerald-600 text-white" isOrders />

            {/* Install App (non-tab, display only) */}
            <div className="relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600">
                  <Smartphone className="w-4 h-4" />
                </div>
                <span>Install App</span>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200 uppercase">APP</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM: BoonTrack Logo Footer ── */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/70 space-y-2">
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div className="w-8 h-8 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-center">
            <span className="text-xs font-black text-indigo-600">B</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 leading-none">
              <span className="text-xs font-black text-slate-900 tracking-tight">BoonTrack</span>
              <span className="text-xs font-extrabold text-blue-600">Shop</span>
            </div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate mt-0.5">
              STORE ENGINE
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// BIO LINK WIDGET — dark card (exact production)
// ─────────────────────────────────────────────────────────────
function StoreBioLinkWidget() {
  const [copied, setCopied] = useState(false);
  const bioUrl = STORE.bioUrl;

  const handleCopy = () => {
    try { navigator.clipboard.writeText(bioUrl); } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-slate-700/80 shadow-xs px-3.5 py-2.5 sm:px-4 sm:py-2 text-white animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-xs">
            <Share2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-slate-100 tracking-tight">Tautan Bio Toko (TikTok, IG, WA)</h3>
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-[1px] rounded-md bg-emerald-950/90 text-emerald-400 border border-emerald-700/60 shrink-0">
                Official Shortlink
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden sm:block mt-0.5">
              Salin tautan resmi ini untuk dipasang di bio media sosial agar calon pembeli langsung menuju toko Anda.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 lg:shrink-0">
          <div className="bg-slate-950/90 border border-slate-700/70 rounded-xl px-3.5 py-2 flex items-center gap-2 font-mono text-xs sm:text-[13px] text-emerald-400 shadow-inner select-all min-w-0 overflow-hidden">
            <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate select-all">{bioUrl}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-sm ${
                copied ? 'bg-emerald-500 text-white shadow-emerald-500/25' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
              }`}
            >
              {copied ? <><Check className="w-3.5 h-3.5 stroke-[2.5]" /><span>Tersalin!</span></> : <><Copy className="w-3.5 h-3.5" /><span>Salin Tautan</span></>}
            </button>
            <div className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 active:scale-95 cursor-pointer shrink-0">
              <span>Kunjungi Toko</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// USAGE QUOTA CARD — Scale / Unlimited (NO trial warnings)
// ─────────────────────────────────────────────────────────────
function UsageQuotaCard() {
  const bars = [
    { title: 'Pesanan Masuk',     current: 2_940, sublabel: 'Unlimited', pct: 98 },
    { title: 'Interaksi AI Bot',  current: 8_412, sublabel: 'Unlimited', pct: 84 },
    { title: 'Notifikasi WhatsApp', current: 2_940, sublabel: 'Unlimited', pct: 98 },
  ];
  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl p-4 sm:p-5 border shadow-[0_1px_4px_rgba(0,0,0,0.04)] bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border-blue-200/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <span>📊</span>
            <span>Penggunaan Kuota Bulan Ini</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>{STORE.tierBadge}</span>
            <span>•</span>
            <span>Aktif</span>
          </span>
        </div>
        <div className="shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Kuota Aman — Unlimited
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
        {bars.map((b) => (
          <div key={b.title} className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">{b.title}</span>
              <span className="font-black font-mono text-[11px] text-indigo-600">
                {b.current.toLocaleString('id-ID')} / ∞
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={b.current} aria-valuemin={0} aria-valuemax={10_000}>
              <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${b.pct}%`, backgroundColor: '#3b82f6' }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{b.sublabel}</span>
              <span className="font-bold text-emerald-600">✓ Aman</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, iconBg, iconColor, icon: Icon }: {
  label: string; value: string; sub: string;
  iconBg: string; iconColor: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
        <div className="mt-1 text-[11px] font-bold text-emerald-600">{sub}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD OVERVIEW TAB
// ─────────────────────────────────────────────────────────────
function DashboardTab({ range, setRange }: { range: DateRange; setRange: (r: DateRange) => void }) {
  const [hasCopied, setHasCopied] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'paid' | 'pending'>('all');

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Pagi' : hour < 15 ? 'Siang' : hour < 18 ? 'Sore' : 'Malam';
  const m = METRICS[range];
  const days = range === '7' ? 7 : range === '30' ? 30 : 60;

  const filteredOrders = useMemo(
    () => orderFilter === 'all' ? ORDERS : ORDERS.filter(o => o.status.toLowerCase() === orderFilter),
    [orderFilter]
  );

  const checklist = [
    { id: 'profile',  title: 'Profil & Logo Toko',             done: true,  action: 'Ubah Profil' },
    { id: 'wa',       title: 'WhatsApp Terhubung (CAPI)',       done: true,  action: 'Lihat Sesi WA' },
    { id: 'qris',     title: 'QRIS Terpasang (EMVCo)',          done: true,  action: 'Perbarui QRIS' },
    { id: 'product',  title: 'Produk Digital Aktif',            done: true,  action: '+ Tambah Lagi' },
    { id: 'capi',     title: 'CAPI Server Container Aktif',     done: true,  action: 'Sudah Aktif' },
    { id: 'ads',      title: 'Campaign Meta Ads Running',       done: true,  action: 'Lihat Iklan' },
    { id: 'share',    title: 'Tautan Toko Disebarkan',          done: hasCopied, action: hasCopied ? 'Tersalin!' : 'Salin Tautan' },
  ];
  const completed = checklist.filter(c => c.done).length;
  const progress = Math.round((completed / checklist.length) * 100);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-in fade-in duration-200">

      {/* ── SECTION A: GREETING & HEADER ── */}
      <section className="space-y-4 sm:space-y-5">

        {/* Greeting Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Selamat {greeting}, {STORE.name} 👋
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {STORE.tierBadge}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Kelola etalase, pantau interaksi WhatsApp CAPI, dan periksa ringkasan performa penjualan dari satu pusat kendali.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => { setHasCopied(true); setTimeout(() => setHasCopied(false), 2500); }}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {hasCopied
                ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Tersalin!</span></>
                : <><Copy className="w-3.5 h-3.5 text-slate-500" /><span>Salin Tautan</span></>}
            </button>
            <div className="px-4 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20">
              <Store className="w-3.5 h-3.5" /><span>Kunjungi Etalase</span><ExternalLink className="w-3 h-3 opacity-80" />
            </div>
          </div>
        </div>

        {/* Bio Link Widget (dark card) */}
        <StoreBioLinkWidget />

        {/* Usage Quota (Scale / Unlimited) */}
        <UsageQuotaCard />

        {/* CAPI Banner */}
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          <Server size={15} className="text-emerald-600 shrink-0" />
          <p className="text-emerald-800 text-sm font-bold flex-1">
            ● Meta Conversions API (CAPI) — WhatsApp Server Container:{' '}
            <span className="text-emerald-700 font-black">ACTIVE / DEDUPLICATED</span>
          </p>
          <div className="flex items-center gap-1.5 bg-emerald-100 border border-emerald-300 rounded-full px-2.5 py-1 shrink-0">
            <CheckCircle size={12} className="text-emerald-600" />
            <span className="text-emerald-800 text-xs font-bold">EQ Score: 9.4/10 · Great</span>
          </div>
        </div>

        {/* 3-Step activation — all done */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-[0_1px_4px_rgba(0,0,0,0.04)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-1.5">
                <Zap className="w-3 h-3 text-emerald-600" /><span>SOP AKTIVASI CTWA COMMERCE</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">3 Infrastruktur Utama — Semua Aktif ✓</h3>
              <p className="text-xs text-slate-500 mt-0.5">WhatsApp CAPI, QRIS Dinamis, dan katalog produk digital sepenuhnya aktif 24/7.</p>
            </div>
            <span className="px-3 py-1 rounded-xl text-xs font-black border bg-emerald-500 text-white border-emerald-500 shadow-sm shrink-0">3/3 Langkah Selesai</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: 1, icon: MessageSquare, title: 'WhatsApp Terhubung', sub: '● Online & Aktif (CAPI Server)', color: 'bg-emerald-500 text-white' },
              { step: 2, icon: QrCode,        title: 'QRIS Terpasang',    sub: 'Dynamic QRIS EMVCo · DOWNWARD', color: 'bg-emerald-500 text-white' },
              { step: 3, icon: Package,       title: '2 Produk Aktif',    sub: 'CTWA 7-Day + VIP Upsell',       color: 'bg-emerald-500 text-white' },
            ].map(s => (
              <div key={s.step} className="p-4 rounded-2xl border bg-emerald-50/50 border-emerald-200 flex flex-col justify-between gap-3.5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Langkah {s.step}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /><span>CONNECTED</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
                      <s.icon className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs sm:text-sm font-black text-slate-900">{s.title}</h4>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-bold">{s.sub}</p>
                </div>
                <button type="button" className="w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300">
                  <span>Lihat Detail</span><ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Testing note */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-slate-700">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>Instruksi Uji Coba:</strong> Kirim chat WhatsApp <em>"Halo kak, mau pesan"</em> ke nomor toko untuk memverifikasi lead capture dan invoice QRIS otomatis.</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 shrink-0">
              🤝 <strong>Handoff:</strong> Saat CS membalas manual, bot otomatis jeda (<code className="text-[10px] bg-slate-200 px-1 py-0.5 rounded font-mono">bot_paused=true</code>).
            </div>
          </div>
        </div>

        {/* BoonPilot Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 sm:p-7 shadow-lg border border-purple-700/40">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 border border-purple-400/30">
                <Zap className="w-3 h-3 text-amber-300" /><span>BOONPILOT COPILOT • CTWA MASTERY</span>
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                🎉 Semua Infrastruktur Aktif — Funnel CTWA Konversi 24/7!
              </h2>
              <p className="text-xs text-purple-200/90 leading-relaxed">
                CAPI Server Container aktif · EQ Score 9.4/10 · CPA Rp 15.714 · ROAS 6.89× — performa optimal di kelas digital course.
              </p>
            </div>
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 flex-wrap">
              <div className="px-3.5 sm:px-4 py-2.5 bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" /><span>Pesanan & Order</span>
                <span className="px-1.5 py-0.5 bg-slate-900 text-emerald-400 text-[10px] font-black rounded-full">2.940</span>
              </div>
              <div className="px-4 py-2.5 bg-white text-purple-950 font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5">
                <span>Lihat Laporan Ads</span><ArrowRight className="w-3.5 h-3.5 text-purple-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Setup Checklist */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start lg:items-center">
            {/* Circular progress */}
            <div className="flex flex-row lg:flex-col items-center gap-4 shrink-0 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 w-full lg:w-48 justify-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-200" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-purple-600 transition-all duration-700 ease-out" strokeDasharray={`${progress}, 100`} strokeLinecap="round" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black text-slate-900">{progress}%</span>
                  <span className="text-[9px] font-bold text-slate-400">Siap Jual</span>
                </div>
              </div>
              <div className="text-left lg:text-center">
                <span className="text-xs font-black text-slate-800 block">{completed} dari {checklist.length} Selesai</span>
                <span className="text-[11px] text-slate-500 block">{completed === checklist.length ? 'Toko sudah prima 🎉' : 'Lengkapi langkah tersisa'}</span>
              </div>
            </div>
            {/* Checklist */}
            <div className="flex-1 w-full space-y-2.5">
              {checklist.map((item, idx) => (
                <div key={item.id} className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${item.done ? 'bg-emerald-50/40 border-emerald-200/70' : 'bg-white border-slate-200/90 hover:border-purple-300 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 border border-slate-300 text-slate-400'}`}>
                      {item.done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span className="text-[10px] font-black">{idx + 1}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-black ${item.done ? 'text-slate-900 line-through opacity-75' : 'text-slate-900'}`}>{item.title}</span>
                      {item.done && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-[1px] rounded-full">Selesai</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={item.id === 'share' ? () => { setHasCopied(true); setTimeout(() => setHasCopied(false), 2500); } : undefined}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer self-start sm:self-center active:scale-95 ${item.done ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs shadow-purple-600/20'}`}
                  >
                    {item.action}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION B: ANALYTICS CARDS (7 hari) ── */}
      <section className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" /><span>Ringkasan Performa (7 Hari Terakhir)</span>
            </h3>
            <p className="text-xs text-slate-500">Pantau arus kunjungan etalase, pesan WhatsApp otomatis, dan sesi pembayaran pelanggan.</p>
          </div>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl hidden sm:inline-block">Auto-Sync 24 Jam</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Pengunjung Etalase"    value="15.963"         sub="Trafik kunjungan 7 hari terakhir"  iconBg="bg-blue-50"    iconColor="text-blue-600"    icon={Eye} />
          <StatCard label="Chat Masuk WA Bot"     value="3.241"          sub="● Online & Aktif • 3.241 Sesi"     iconBg="bg-emerald-50" iconColor="text-emerald-600" icon={MessageSquare} />
          <StatCard label="Pesanan / Invoice QRIS" value="672"           sub="672 Pesanan (7 Hari Terakhir)"     iconBg="bg-purple-50"  iconColor="text-purple-600"  icon={Receipt} />
          <StatCard label="Estimasi Nilai Masuk"  value={fmtRp(74_318_000)} sub="100% Masuk Rekening"           iconBg="bg-amber-50"   iconColor="text-amber-600"   icon={Wallet} />
        </div>
      </section>

      {/* ── SECTION C: ADS METRICS + DATE RANGE ── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" /><span>Performa Ads Meta (ROAS & CAPI)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">KPI Meta Ads yang tersinkronisasi melalui WhatsApp Server Container CAPI.</p>
          </div>
          {/* Date range tabs */}
          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
            {(['7', '30', 'all'] as DateRange[]).map(r => (
              <button key={r} type="button" onClick={() => setRange(r)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${range === r ? 'bg-white text-indigo-700 shadow border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                {r === '7' ? '7 Hari' : r === '30' ? '30 Hari' : 'Semua'}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: 'Total Revenue',  value: fmtRp(m.rev),                    sub: `+${(m.cr * 0.9).toFixed(1)}% vs prev`, spark: [5,6,7,8,9,7,8,9,10,9,8,9,10],                                  iconBg: 'bg-violet-50',  iconColor: 'text-violet-600', icon: Wallet,      sc: '#7c3aed' },
            { label: 'Total Orders',   value: m.ord.toLocaleString('id-ID'),    sub: 'Pesanan Lunas',                         spark: [4,5,4,6,7,6,7,8,9,8,9,10,9],                                  iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',   icon: ShoppingBag, sc: '#2563eb' },
            { label: 'Ad Spend',       value: fmtRp(m.spend),                  sub: 'Meta Ads Total',                         spark: [7,7,6,7,7,8,7,7,8,7,8,7,7],                                  iconBg: 'bg-orange-50',  iconColor: 'text-orange-600', icon: Target,      sc: '#ea580c' },
            { label: 'ROAS',           value: `${m.roas.toFixed(2)}×`,         sub: 'Return on Ad Spend',                     spark: [5,5.5,6,6.5,6.8,7,6.9,6.8,6.9,6.8,6.89,6.89,6.89],          iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',icon: TrendingUp,  sc: '#059669' },
            { label: 'CPA',            value: `Rp ${m.cpa.toLocaleString('id-ID')}`, sub: 'Cost per Purchase WA',            spark: [18,17,16.5,16.2,15.9,15.8,15.714,15.714,15.714,15.7,15.7,15.714,15.714].reverse(), iconBg: 'bg-pink-50', iconColor: 'text-pink-600', icon: Zap, sc: '#db2777' },
            { label: 'Conv. Rate',     value: `${m.cr}%`,                      sub: 'dari Lead WhatsApp',                     spark: [14,15,16,17,18,18.2,18.4,18.4,18.4,18.4,18.4,18.4,18.4],     iconBg: 'bg-cyan-50',    iconColor: 'text-cyan-600',   icon: Activity,   sc: '#0891b2' },
          ].map(card => (
            <div key={card.label} className="relative bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow group overflow-hidden">
              <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center ${card.iconColor} mb-3`}>
                <card.icon className="w-4 h-4" />
              </div>
              <p className="text-slate-500 text-xs font-medium mb-1">{card.label}</p>
              <p className="text-slate-900 font-black text-base leading-tight">{card.value}</p>
              <p className="text-slate-400 text-[11px] mt-0.5">{card.sub}</p>
              <div className="absolute bottom-3 right-3 opacity-50 group-hover:opacity-100 transition-opacity">
                <Sparkline data={card.spark} color={card.sc} />
              </div>
            </div>
          ))}
        </div>

        {/* Revenue area chart */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-black text-slate-900">Revenue Harian</h4>
              <p className="text-slate-500 text-xs mt-0.5">{range === '7' ? '7 hari terakhir' : range === '30' ? '30 hari terakhir' : 'Semua data tersedia'}</p>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-600 text-xs bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Revenue (IDR)
            </div>
          </div>
          <div className="w-full overflow-hidden" style={{ height: 160 }}>
            <RevenueChart days={days} />
          </div>
        </div>
      </section>

      {/* ── SECTION D: MIDNIGHT ORDERS TABLE ── */}
      <section>
        {/* Hero angle card */}
        <div className="mb-4 bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 rounded-2xl p-4 sm:p-5 border border-indigo-700/30 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  🌙 Bangun Tidur Banjir Order
                </span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">22–23 Sep 2026, 23:45 – 05:14</span>
              </div>
              <p className="text-white font-black text-sm sm:text-base">
                7 Pesanan Masuk Tanpa Direspons Manual — Bot CAPI Bekerja Saat Kamu Tidur 😴
              </p>
              <p className="text-slate-400 text-xs">
                Semua order dikonfirmasi otomatis melalui WhatsApp CTWA + QRIS Dinamis. Bangun tidur langsung cek dashboard.
              </p>
            </div>
            <div className="shrink-0 text-center">
              <div className="text-2xl font-black text-emerald-400">{fmtRp(ORDERS.reduce((s, o) => s + o.amount, 0))}</div>
              <div className="text-[11px] text-slate-400 font-bold">Omzet Dini Hari</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Table controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900">Pesanan Real-Time — Dini Hari 23 Sep</h3>
              <p className="text-slate-500 text-xs mt-0.5">{filteredOrders.length} transaksi · Channel: WhatsApp CTWA (CAPI Server)</p>
            </div>
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-slate-400" />
              <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
                {(['all', 'paid', 'pending'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setOrderFilter(f)} className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${orderFilter === f ? 'bg-white text-indigo-700 shadow border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                    {f === 'all' ? 'Semua' : f === 'paid' ? '✓ Lunas' : '⏳ Pending'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 font-bold whitespace-nowrap">Waktu</th>
                  <th className="text-left px-3 py-3 font-bold whitespace-nowrap">ID Order</th>
                  <th className="text-left px-3 py-3 font-bold">Pembeli</th>
                  <th className="text-left px-3 py-3 font-bold hidden md:table-cell">Produk</th>
                  <th className="text-right px-3 py-3 font-bold">Nominal</th>
                  <th className="text-left px-3 py-3 font-bold hidden lg:table-cell">Metode</th>
                  <th className="text-center px-3 py-3 font-bold">Status</th>
                  <th className="text-center px-5 py-3 font-bold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <React.Fragment key={order.id}>
                    <tr
                      onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                      className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-slate-700 text-xs font-bold">{order.ts}</span>
                        <span className="block text-slate-400 text-[10px] mt-0.5">🌙 Dini hari</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="font-mono text-indigo-600 text-xs font-black">{order.id}</span>
                      </td>
                      <td className="px-3 py-3.5 text-slate-900 font-bold text-xs whitespace-nowrap">{order.buyer}</td>
                      <td className="px-3 py-3.5 hidden md:table-cell text-slate-600 text-xs">{order.product}</td>
                      <td className="px-3 py-3.5 text-right">
                        <span className="text-slate-900 font-black text-xs whitespace-nowrap">Rp {order.amount.toLocaleString('id-ID')}</span>
                      </td>
                      <td className="px-3 py-3.5 hidden lg:table-cell text-slate-500 text-xs">{order.method}</td>
                      <td className="px-3 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />{order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <ChevronDown size={16} className={`inline transition-transform duration-200 text-slate-400 group-hover:text-indigo-500 ${expandedOrder === order.id ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                    {expandedOrder === order.id && (
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                            {[
                              ['Produk', order.product],
                              ['Metode Bayar', order.method],
                              ['Channel', 'WhatsApp CTWA (CAPI Server)'],
                              ['CAPI Event', 'Purchase · Matched ✓'],
                              ['Waktu Bayar', order.ts + ' WIB'],
                              ['Dedup Status', 'No Duplicate ✓'],
                              ['Container', 'WA Server Container v2 · Aktif'],
                            ].map(([k, v]) => (
                              <div key={k}>
                                <p className="text-slate-400 font-medium mb-0.5">{k}</p>
                                <p className="text-slate-800 font-bold">{v}</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-slate-400 text-xs">Menampilkan {filteredOrders.length} dari {ORDERS.length} transaksi · Dini hari 23 Sep</p>
            <div className="flex items-center gap-1.5">
              {['← Prev', '1', '2', 'Next →'].map(p => (
                <button key={p} type="button" className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${p === '1' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ORDERS TAB
// ─────────────────────────────────────────────────────────────
function OrdersTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-black text-slate-900">Pesanan & Order</h2>
        <p className="text-xs text-slate-500 mt-0.5">CTWA Mastery 7-Day Intensive · {ORDERS.length} pesanan dini hari 23 Sep</p>
      </div>

      {/* Midnight angle banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 rounded-2xl p-4 border border-indigo-700/30">
        <p className="text-white font-black text-sm">🌙 Bangun Tidur Banjir Order — Bot CAPI Aktif 24 Jam Nonstop</p>
        <p className="text-slate-400 text-xs mt-1">Total Dini Hari: <span className="text-emerald-400 font-black">{fmtRp(ORDERS.reduce((s, o) => s + o.amount, 0))}</span> · 7 transaksi otomatis via WhatsApp CTWA</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-bold whitespace-nowrap">Waktu</th>
                <th className="text-left px-3 py-3 font-bold">ID</th>
                <th className="text-left px-3 py-3 font-bold">Pembeli</th>
                <th className="text-left px-3 py-3 font-bold hidden md:table-cell">Produk</th>
                <th className="text-right px-3 py-3 font-bold">Nominal</th>
                <th className="text-left px-3 py-3 font-bold hidden lg:table-cell">Metode</th>
                <th className="text-center px-3 py-3 font-bold">Status</th>
                <th className="text-center px-5 py-3 font-bold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {ORDERS.map(order => (
                <React.Fragment key={order.id}>
                  <tr onClick={() => setExpanded(expanded === order.id ? null : order.id)} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer group">
                    <td className="px-5 py-3.5"><span className="font-mono text-slate-700 text-xs font-bold">{order.ts}</span></td>
                    <td className="px-3 py-3.5"><span className="font-mono text-indigo-600 text-xs font-black">{order.id}</span></td>
                    <td className="px-3 py-3.5 text-slate-900 font-bold text-xs">{order.buyer}</td>
                    <td className="px-3 py-3.5 hidden md:table-cell text-slate-600 text-xs">{order.product}</td>
                    <td className="px-3 py-3.5 text-right"><span className="text-slate-900 font-black text-xs">Rp {order.amount.toLocaleString('id-ID')}</span></td>
                    <td className="px-3 py-3.5 hidden lg:table-cell text-slate-500 text-xs">{order.method}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />{order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <ChevronDown size={16} className={`inline transition-transform duration-200 text-slate-400 group-hover:text-indigo-500 ${expanded === order.id ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {expanded === order.id && (
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                          {[['Channel', 'WhatsApp CTWA (CAPI Server)'], ['CAPI Event', 'Purchase · Matched ✓'], ['Dedup', 'No Duplicate ✓'], ['Container', 'WA Server v2 · Aktif']].map(([k, v]) => (
                            <div key={k}><p className="text-slate-400 font-medium mb-0.5">{k}</p><p className="text-slate-800 font-bold">{v}</p></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ADS TRACKING PRO TAB
// ─────────────────────────────────────────────────────────────
function AdsTrackingTab() {
  const [activeEvent, setActiveEvent] = useState<string | null>(null);

  const events = [
    { name: 'Purchase',        count: 2_940, matchQuality: 9.4, dedup: '98.4%', status: 'Active',   color: 'emerald' },
    { name: 'InitiateCheckout', count: 4_218, matchQuality: 9.1, dedup: '97.2%', status: 'Active',   color: 'blue'    },
    { name: 'Lead (CTWA)',      count: 15_963, matchQuality: 8.8, dedup: '96.5%', status: 'Active',  color: 'indigo'  },
    { name: 'ViewContent',     count: 22_401, matchQuality: 7.9, dedup: '94.1%', status: 'Active',   color: 'purple'  },
  ];

  const campaigns = [
    { name: 'CTWA Mastery — Cold Traffic WC',    spend: 18_400_000, results: 1_241, cpa: 14_826, roas: 6.94, status: 'Aktif',   budget: 650_000  },
    { name: 'CTWA Mastery — Retargeting VIP',    spend:  9_800_000, results:   623, cpa: 15_730, roas: 9.48, status: 'Aktif',   budget: 400_000  },
    { name: 'CTWA Mastery — Lookalike 1-3%',     spend: 12_100_000, results:   802, cpa: 15_087, roas: 6.61, status: 'Aktif',   budget: 500_000  },
    { name: 'CTWA Mastery — ABO Testing Phase',  spend:  5_900_000, results:   274, cpa: 21_533, roas: 4.60, status: 'Paused', budget: 300_000  },
  ];

  const pixelHealth = [
    { label: 'Server Container Status',  value: 'ACTIVE',          ok: true  },
    { label: 'Deduplication',            value: '98.4% clean',      ok: true  },
    { label: 'Event Match Quality',      value: '9.4 / 10 — Great', ok: true  },
    { label: 'Browser Pixel Fallback',   value: 'ON (Redundant)',    ok: true  },
    { label: 'Conversions API Version',  value: 'v21.0 — Latest',   ok: true  },
    { label: 'Test Event Code',          value: 'TEST43922 — Clear', ok: true  },
  ];

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />Ads Tracking Pro
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Meta Conversions API (CAPI) · WhatsApp Server Container · ROAS 6.89× · CPA Rp 15.714</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />CAPI Server Online
          </span>
        </div>
      </div>

      {/* CAPI Health Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 border border-indigo-700/30 shadow-lg">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                <Server className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-black text-sm">Meta Conversions API — WhatsApp Server Container</p>
                <p className="text-emerald-400 text-xs font-bold">● ACTIVE · DEDUPLICATED · v21.0</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pixelHealth.map(h => (
                <div key={h.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <p className="text-slate-400 text-[10px] font-medium mb-1">{h.label}</p>
                  <p className={`text-xs font-black ${h.ok ? 'text-emerald-400' : 'text-red-400'}`}>{h.value}</p>
                </div>
              ))}
            </div>
          </div>
          {/* EQ Score ring */}
          <div className="flex flex-row lg:flex-col items-center gap-4 shrink-0 p-4 bg-white/5 border border-white/10 rounded-2xl lg:w-44 justify-center">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                <path stroke="#1e293b" strokeWidth="3.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path stroke="#10b981" strokeDasharray="94, 100" strokeLinecap="round" strokeWidth="3.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-black text-white">9.4</span>
                <span className="text-[9px] font-bold text-slate-400">/10</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-white font-black text-sm">Event Match</p>
              <p className="text-emerald-400 font-bold text-xs">Quality Score</p>
              <p className="text-emerald-300 font-black text-xs mt-0.5">🏆 GREAT</p>
            </div>
          </div>
        </div>
      </div>

      {/* Event table */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Custom Events — Status CAPI</h3>
          <p className="text-slate-500 text-xs mt-0.5">Klik baris untuk detail deduplication & match rate</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-bold">Event Name</th>
                <th className="text-right px-3 py-3 font-bold">Count (30hr)</th>
                <th className="text-center px-3 py-3 font-bold">Match Quality</th>
                <th className="text-center px-3 py-3 font-bold">Dedup Rate</th>
                <th className="text-center px-3 py-3 font-bold">Status</th>
                <th className="text-center px-5 py-3 font-bold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <React.Fragment key={ev.name}>
                  <tr onClick={() => setActiveEvent(activeEvent === ev.name ? null : ev.name)} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full bg-${ev.color}-500 inline-block shrink-0`} />
                        <span className="font-mono text-xs font-black text-slate-800">{ev.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right font-black text-sm text-slate-900">{ev.count.toLocaleString('id-ID')}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${ ev.matchQuality >= 9 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200' }`}>
                        {ev.matchQuality}/10
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-center font-black text-sm text-emerald-700">{ev.dedup}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{ev.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <ChevronDown size={16} className={`inline transition-transform duration-200 text-slate-400 group-hover:text-indigo-500 ${activeEvent === ev.name ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {activeEvent === ev.name && (
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                          {[
                            ['Channel', 'WhatsApp CTWA (Server Container)'],
                            ['Deduplication Key', 'external_id + fbclid'],
                            ['Browser Pixel', 'ON (Redundant fallback)'],
                            ['Server Container', 'Meta CAPI v21.0 · ACTIVE'],
                            ['Last Received', '23 Sep, 05:14 WIB · Purchase'],
                            ['Test Event', 'TEST43922 · Passed ✓'],
                          ].map(([k, v]) => (
                            <div key={k}><p className="text-slate-400 font-medium mb-0.5">{k}</p><p className="text-slate-800 font-bold">{v}</p></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign performance table */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Performa Campaign Meta Ads</h3>
          <p className="text-slate-500 text-xs mt-0.5">Total Spend: {fmtRp(46_200_000)} · Total Results: 2.940 · Avg ROAS: 6.89×</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-bold">Campaign</th>
                <th className="text-right px-3 py-3 font-bold">Spend</th>
                <th className="text-right px-3 py-3 font-bold">Results</th>
                <th className="text-right px-3 py-3 font-bold">CPA</th>
                <th className="text-right px-3 py-3 font-bold">ROAS</th>
                <th className="text-right px-3 py-3 font-bold hidden lg:table-cell">Budget/Day</th>
                <th className="text-center px-5 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.name} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-bold text-slate-800 line-clamp-1">{c.name}</span>
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold text-xs text-slate-700">{fmtRp(c.spend)}</td>
                  <td className="px-3 py-3.5 text-right font-black text-sm text-slate-900">{c.results.toLocaleString('id-ID')}</td>
                  <td className="px-3 py-3.5 text-right text-xs font-bold text-slate-600">Rp {c.cpa.toLocaleString('id-ID')}</td>
                  <td className="px-3 py-3.5 text-right">
                    <span className={`font-black text-sm ${c.roas >= 6 ? 'text-emerald-600' : 'text-amber-600'}`}>{c.roas.toFixed(2)}×</span>
                  </td>
                  <td className="px-3 py-3.5 text-right text-xs font-bold text-slate-500 hidden lg:table-cell">{fmtRp(c.budget)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${c.status === 'Aktif' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'Aktif' ? 'bg-emerald-500' : 'bg-amber-500'} inline-block`} />{c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LAPORAN KEUANGAN TAB
// ─────────────────────────────────────────────────────────────
function FinanceTab() {
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const withdrawals = [
    { date: '23 Sep 2026', amount: 12_640_000, method: 'Auto Transfer BCA',    status: 'Selesai', ref: 'TRF-2026092301' },
    { date: '22 Sep 2026', amount: 11_880_000, method: 'Auto Transfer BCA',    status: 'Selesai', ref: 'TRF-2026092201' },
    { date: '21 Sep 2026', amount: 13_210_000, method: 'Auto Transfer BCA',    status: 'Selesai', ref: 'TRF-2026092101' },
    { date: '20 Sep 2026', amount: 10_450_000, method: 'Auto Transfer BCA',    status: 'Selesai', ref: 'TRF-2026092001' },
    { date: '19 Sep 2026', amount: 9_970_000,  method: 'Auto Transfer BCA',    status: 'Selesai', ref: 'TRF-2026091901' },
    { date: '18 Sep 2026', amount: 11_320_000, method: 'Auto Transfer Mandiri', status: 'Selesai', ref: 'TRF-2026091801' },
    { date: '17 Sep 2026', amount: 8_890_000,  method: 'Auto Transfer BCA',    status: 'Selesai', ref: 'TRF-2026091701' },
  ];

  const dailyRevs = [
    { date: '23 Sep', orders: 7,   gross: 842_000,   net: 824_000,   day: '23 Sep 2026' },
    { date: '22 Sep', orders: 98,  gross: 11_880_000, net: 11_638_000, day: '22 Sep 2026' },
    { date: '21 Sep', orders: 112, gross: 13_210_000, net: 12_945_800, day: '21 Sep 2026' },
    { date: '20 Sep', orders: 89,  gross: 10_450_000, net: 10_241_000, day: '20 Sep 2026' },
    { date: '19 Sep', orders: 84,  gross:  9_970_000, net:  9_770_600, day: '19 Sep 2026' },
    { date: '18 Sep', orders: 96,  gross: 11_320_000, net: 11_093_600, day: '18 Sep 2026' },
    { date: '17 Sep', orders: 76,  gross:  8_890_000, net:  8_712_200, day: '17 Sep 2026' },
  ];

  const totalNet = 318_483_000;
  const totalFee = Math.round(totalNet * 0.02);
  const totalGross = totalNet + totalFee;

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-600" />Laporan Keuangan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Mutasi saldo bersih · Pencairan otomatis · Rekap harian — 30 Hari Terakhir</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
          ✓ Saldo Tersinkronisasi
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Gross Revenue (30 Hari)',  value: fmtRp(totalGross),  sub: 'Sebelum biaya platform', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', icon: Wallet,       color: 'slate' },
          { label: 'Biaya Platform (2%)',      value: fmtRp(totalFee),    sub: 'MDR + Processing fee',   iconBg: 'bg-rose-50',   iconColor: 'text-rose-500',  icon: CreditCard,   color: 'rose'  },
          { label: 'Saldo Bersih (Net)',       value: fmtRp(totalNet),    sub: '100% masuk rekening',    iconBg: 'bg-emerald-50',iconColor: 'text-emerald-600',icon: CheckCircle, color: 'emerald'},
        ].map(c => (
          <div key={c.label} className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">{c.label}</span>
              <div className={`w-8 h-8 rounded-xl ${c.iconBg} ${c.iconColor} flex items-center justify-center`}><c.icon className="w-4 h-4" /></div>
            </div>
            <div>
              <div className={`text-2xl font-black tracking-tight ${c.color === 'emerald' ? 'text-emerald-700' : c.color === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{c.value}</div>
              <div className="mt-1 text-[11px] font-bold text-slate-400">{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Balance visual bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black text-slate-800">Distribusi Pendapatan</span>
          <span className="text-xs font-bold text-slate-500">{fmtRp(totalGross)} Total Gross</span>
        </div>
        <div className="h-4 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div className="h-full bg-emerald-500 rounded-l-full transition-all" style={{ width: '98%' }} />
          <div className="h-full bg-rose-400 rounded-r-full transition-all" style={{ width: '2%' }} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px]">
          <span className="flex items-center gap-1 font-bold text-emerald-700"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Saldo Bersih (98%)</span>
          <span className="flex items-center gap-1 font-bold text-rose-500"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />Biaya Platform (2%)</span>
        </div>
      </div>

      {/* Withdrawal History */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Riwayat Pencairan Otomatis</h3>
          <p className="text-slate-500 text-xs mt-0.5">Auto-transfer setiap hari jam 07.00 WIB · Langsung ke rekening terdaftar</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-bold">Tanggal</th>
                <th className="text-right px-3 py-3 font-bold">Nominal</th>
                <th className="text-left px-3 py-3 font-bold hidden md:table-cell">Metode</th>
                <th className="text-left px-3 py-3 font-bold hidden lg:table-cell">Ref Transfer</th>
                <th className="text-center px-5 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map(w => (
                <tr key={w.ref} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-xs text-slate-700">{w.date}</td>
                  <td className="px-3 py-3.5 text-right font-black text-sm text-slate-900">{fmtRp(w.amount)}</td>
                  <td className="px-3 py-3.5 hidden md:table-cell text-slate-500 text-xs">{w.method}</td>
                  <td className="px-3 py-3.5 hidden lg:table-cell">
                    <span className="font-mono text-[11px] text-indigo-600 font-bold">{w.ref}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />{w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Revenue Breakdown */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Rincian Transaksi Harian</h3>
          <p className="text-slate-500 text-xs mt-0.5">Klik baris untuk melihat breakdown gross / net / fee</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-bold">Tanggal</th>
                <th className="text-right px-3 py-3 font-bold">Orders</th>
                <th className="text-right px-3 py-3 font-bold">Gross</th>
                <th className="text-right px-5 py-3 font-bold">Net (98%)</th>
                <th className="text-center px-5 py-3 font-bold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {dailyRevs.map(d => (
                <React.Fragment key={d.day}>
                  <tr onClick={() => setActiveDay(activeDay === d.day ? null : d.day)} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors cursor-pointer group">
                    <td className="px-5 py-3.5 font-bold text-xs text-slate-700">{d.date}</td>
                    <td className="px-3 py-3.5 text-right font-black text-sm text-slate-900">{d.orders}</td>
                    <td className="px-3 py-3.5 text-right text-xs font-bold text-slate-600">{fmtRp(d.gross)}</td>
                    <td className="px-5 py-3.5 text-right font-black text-sm text-emerald-700">{fmtRp(d.net)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <ChevronDown size={16} className={`inline transition-transform duration-200 text-slate-400 group-hover:text-indigo-500 ${activeDay === d.day ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {activeDay === d.day && (
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <td colSpan={5} className="px-5 py-4">
                        <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                          {[
                            ['Gross Revenue', fmtRp(d.gross)],
                            ['Biaya Platform (2%)', fmtRp(Math.round(d.gross * 0.02))],
                            ['Saldo Bersih (Net)', fmtRp(d.net)],
                            ['Jumlah Order', `${d.orders} transaksi`],
                            ['Avg Order Value', fmtRp(Math.round(d.gross / d.orders))],
                            ['Pencairan', 'Auto Transfer jam 07.00 WIB'],
                          ].map(([k, v]) => (
                            <div key={k}><p className="text-slate-400 font-medium mb-0.5">{k}</p><p className="text-slate-800 font-bold">{v}</p></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Total footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-black text-slate-700">Total 30 Hari</span>
          <div className="flex items-center gap-6">
            <span className="text-xs font-bold text-slate-500">2.940 orders</span>
            <span className="text-xs font-black text-emerald-700">{fmtRp(totalNet)} Bersih</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PLACEHOLDER TABS
// ─────────────────────────────────────────────────────────────
function PlaceholderTab({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-in fade-in duration-200">
      <div className="text-center space-y-3 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto"><Icon className="w-7 h-7 text-indigo-500" /></div>
        <h3 className="text-base font-black text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500">{desc}</p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
          📸 Demo Mockup — Showcase Only
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT PAGE COMPONENT
// ─────────────────────────────────────────────────────────────
export default function ShowcaseDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [range, setRange] = useState<DateRange>('30');
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    setThemeMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return next;
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':    return <DashboardTab range={range} setRange={setRange} />;
      case 'orders':       return <OrdersTab />;
      case 'catalog':      return <PlaceholderTab title="Produk & Materi Digital" desc="CTWA Mastery 7-Day + VIP Upsell tersedia di katalog." icon={Package} />;
      case 'downloads':    return <PlaceholderTab title="Akses Unduh & Lisensi" desc="Pengiriman materi digital otomatis pasca-pembayaran." icon={FolderKey} />;
      case 'themes':       return <PlaceholderTab title="Tampilan & Tema" desc="5 tema visual storefront siap diaktifkan." icon={Palette} />;
      case 'ai_knowledge': return <PlaceholderTab title="AI Knowledge & Bot" desc="Bot WA aktif 24/7 dengan training product CTWA Mastery." icon={Brain} />;
      case 'whatsapp':     return <PlaceholderTab title="WhatsApp & Broadcast" desc="WABA + CAPI Server Container aktif & deduplicated." icon={Radio} />;
      case 'inbox':        return <PlaceholderTab title="BoonTrack Inbox" desc="10 chat masuk baru menunggu — CS siap merespons." icon={MessageSquare} />;
      case 'ads_tracking': return <AdsTrackingTab />;
      case 'finance':      return <FinanceTab />;
    }
  };

  return (
    <main className={`min-h-[100dvh] font-sans flex flex-col lg:flex-row antialiased dashboard-theme-container ${themeMode === 'dark' ? 'bg-[#0B0F19] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>

      {/* ── MOBILE DRAWER ── */}
      {mobileDrawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" onClick={() => setMobileDrawer(false)} />
          <div className="fixed inset-y-0 left-0 w-[290px] sm:w-[320px] max-w-[85vw] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-left duration-250">
            <div className="absolute top-3 right-3 z-50">
              <button type="button" onClick={() => setMobileDrawer(false)} className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Sidebar className="w-full h-full border-r-0 static" activeTab={activeTab} setActiveTab={setActiveTab} onClose={() => setMobileDrawer(false)} />
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      <Sidebar className="hidden lg:flex" activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen w-full">

        {/* Mobile top navbar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMobileDrawer(true)} className="p-2 -ml-1.5 rounded-xl text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:scale-95 transition cursor-pointer">
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white font-black text-[10px] flex items-center justify-center shrink-0 uppercase">
              {STORE.initial}
            </div>
            <span className="text-xs font-black text-slate-900 truncate">{STORE.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={toggleTheme} className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer transition active:scale-95 theme-toggle-btn">
              {themeMode === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
            <button type="button" onClick={() => setActiveTab('orders')} className={`p-1.5 rounded-lg border transition cursor-pointer ${activeTab === 'orders' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
              <ShoppingBag className="w-4 h-4" />
            </button>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">Store Online</span>
              <span className="sm:hidden">Live</span>
            </span>
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 xl:px-8 py-2.5 items-center justify-between gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                activeTab === 'orders'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Pesanan & Order</span>
              <span className={`px-1.5 py-[1px] rounded-full text-[10px] font-black ${activeTab === 'orders' ? 'bg-white text-emerald-800' : 'bg-emerald-600 text-white'}`}>
                2.940
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 font-bold flex items-center gap-2 text-xs transition active:scale-95 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)] theme-toggle-btn"
            >
              {themeMode === 'dark'
                ? <><Sun className="w-3.5 h-3.5 text-amber-400" /><span className="text-[11px] font-semibold text-slate-200">Light Mode</span></>
                : <><Moon className="w-3.5 h-3.5 text-slate-600" /><span className="text-[11px] font-semibold text-slate-700">Dark Mode</span></>}
            </button>
            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Storefront Online</span>
            </span>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 flex items-start min-w-0 w-full">
          <div className="flex-1 min-w-0 w-full">
            {renderContent()}
          </div>
        </div>
      </div>
    </main>
  );
}
