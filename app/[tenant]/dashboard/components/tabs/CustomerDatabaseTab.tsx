'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  Phone,
  MessageSquare,
  ArrowUpRight,
  RefreshCw,
  UserCheck,
  UserPlus,
  ShoppingBag,
  Star,
  Filter,
  ChevronDown,
  Clock,
  Loader2,
  Inbox,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
type LifecycleStage = 'ALL' | 'LEAD' | 'QUALIFIED' | 'CUSTOMER' | 'INACTIVE';

interface CustomerRow {
  id: string;
  customerPhone: string;
  customerName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  tag: string | null;
  unreadCount: number;
  lifecycleStage: string;
  totalOrders: number;
  assignedAgentName: string;
}

interface CustomerDatabaseTabProps {
  tenantSlug: string;
  tenantId: string | null;
  /** Callback to deep-link into the Inbox tab for a specific conversation */
  onOpenInbox: (phone?: string) => void;
  isCrmEnabled?: boolean;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
const LIFECYCLE_FILTERS: { key: LifecycleStage; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'ALL', label: 'Semua', icon: Users, color: 'text-slate-600' },
  { key: 'LEAD', label: 'Lead', icon: UserPlus, color: 'text-blue-600' },
  { key: 'QUALIFIED', label: 'Qualified', icon: UserCheck, color: 'text-indigo-600' },
  { key: 'CUSTOMER', label: 'Customer', icon: ShoppingBag, color: 'text-emerald-600' },
  { key: 'INACTIVE', label: 'Inactive', icon: Clock, color: 'text-slate-400' },
];

const LIFECYCLE_BADGE: Record<string, { label: string; cls: string }> = {
  LEAD: { label: 'Lead', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  QUALIFIED: { label: 'Qualified', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  CUSTOMER: { label: 'Customer', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REPEAT_CUSTOMER: { label: 'Repeat', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  INACTIVE: { label: 'Inactive', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '\u2014';
  const now = Date.now();
  const diff = now - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarGradient(phone: string): string {
  const gradients = [
    'from-indigo-500 to-blue-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-sky-600',
  ];
  const idx = phone.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

// -------------------------------------------------------------------
// Main Component
// -------------------------------------------------------------------
export default function CustomerDatabaseTab({
  tenantSlug,
  tenantId,
  onOpenInbox,
}: CustomerDatabaseTabProps) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LifecycleStage>('ALL');
  const [sortBy, setSortBy] = useState<'lastActivity' | 'name' | 'orders'>('lastActivity');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // -------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const orTokens: string[] = [];
      if (tenantId) {
        orTokens.push(`tenant_id.eq.${tenantId}`);
        orTokens.push(`tenant_slug.eq.${tenantId}`);
      }
      if (tenantSlug) {
        orTokens.push(`tenant_slug.eq.${tenantSlug}`);
        orTokens.push(`tenant_id.eq.${tenantSlug}`);
      }
      if (orTokens.length === 0) return;

      const { data, error } = await supabase
        .from('conversations')
        .select(
          'id, customer_phone, customer_name, last_message, last_message_at, tag, unread_count, lifecycle_stage, assigned_agent_id'
        )
        .or(orTokens.join(','))
        .order('last_message_at', { ascending: false })
        .limit(500);

      if (error || !Array.isArray(data)) {
        setCustomers([]);
        return;
      }

      // Deduplicate by phone
      const seen = new Set<string>();
      const rows: CustomerRow[] = [];
      for (const c of data) {
        const phone = (c.customer_phone || '').replace(/\D/g, '');
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        rows.push({
          id: c.id,
          customerPhone: c.customer_phone || '',
          customerName: c.customer_name || c.customer_phone || 'Pelanggan',
          lastMessage: c.last_message || '',
          lastMessageAt: c.last_message_at || null,
          tag: c.tag || null,
          unreadCount: c.unread_count || 0,
          lifecycleStage: (c.lifecycle_stage || 'LEAD').toUpperCase(),
          totalOrders: 0,
          assignedAgentName: c.assigned_agent_id ? 'CS Aktif' : 'Bot / Unassigned',
        });
      }
      setCustomers(rows);
    } catch (err) {
      console.warn('[CustomerDatabaseTab] fetch error:', err);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, tenantSlug]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers, refreshKey]);

  // Close sort dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('[data-sort-dropdown]')) setIsSortOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // -------------------------------------------------------------------
  // Filtered + Sorted list
  // -------------------------------------------------------------------
  const filtered = useMemo(() => {
    let list = customers;

    if (activeFilter !== 'ALL') {
      list = list.filter((c) =>
        activeFilter === 'INACTIVE'
          ? c.lifecycleStage === 'INACTIVE'
          : c.lifecycleStage === activeFilter ||
            (activeFilter === 'CUSTOMER' && c.lifecycleStage === 'REPEAT_CUSTOMER')
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) => c.customerName.toLowerCase().includes(q) || c.customerPhone.includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.customerName.localeCompare(b.customerName, 'id');
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      const da = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const db = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return db - da;
    });
  }, [customers, activeFilter, searchQuery, sortBy]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: customers.length };
    for (const c of customers) {
      const stage =
        c.lifecycleStage === 'REPEAT_CUSTOMER' ? 'CUSTOMER' : c.lifecycleStage;
      map[stage] = (map[stage] || 0) + 1;
    }
    return map;
  }, [customers]);

  const SORT_LABELS: Record<string, string> = {
    lastActivity: 'Aktivitas Terbaru',
    name: 'Nama (A\u2013Z)',
    orders: 'Total Pesanan',
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">Pelanggan</h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {isLoading
                  ? 'Memuat...'
                  : `${customers.length.toLocaleString('id-ID')} kontak ditemukan`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative" data-sort-dropdown>
              <button
                type="button"
                onClick={() => setIsSortOpen((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
              >
                <Filter className="w-3 h-3" />
                <span>{SORT_LABELS[sortBy]}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {isSortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg p-1 z-20 min-w-[160px] animate-in fade-in zoom-in-95 duration-100">
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSortBy(key as 'lastActivity' | 'name' | 'orders');
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        sortBy === key
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            id="customer-search-input"
            type="text"
            placeholder="Cari nama atau nomor WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400 transition"
          />
        </div>

        {/* Lifecycle filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {LIFECYCLE_FILTERS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              type="button"
              id={`customer-filter-${key.toLowerCase()}`}
              onClick={() => setActiveFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                activeFilter === key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon className={`w-3 h-3 ${activeFilter === key ? 'text-white' : color}`} />
              <span>{label}</span>
              {counts[key] !== undefined && (
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    activeFilter === key
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs font-medium">Memuat database pelanggan...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400 px-6 text-center">
            <Users className="w-8 h-8 text-slate-300" />
            <div>
              <p className="text-sm font-semibold text-slate-600">
                {searchQuery ? 'Tidak ada hasil pencarian' : 'Belum ada data pelanggan'}
              </p>
              <p className="text-xs mt-1">
                {searchQuery
                  ? `Coba kata kunci lain untuk "${searchQuery}"`
                  : 'Data akan muncul setelah ada percakapan WhatsApp masuk.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Table header row */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_160px_130px_100px] gap-4 px-5 py-2 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
              <div className="w-9" />
              <div>Pelanggan</div>
              <div>Pesan Terakhir</div>
              <div>Aktivitas</div>
              <div>Aksi</div>
            </div>

            {filtered.map((customer) => {
              const badge = LIFECYCLE_BADGE[customer.lifecycleStage] ?? LIFECYCLE_BADGE['LEAD'];
              const gradient = getAvatarGradient(customer.customerPhone);
              return (
                <div
                  key={customer.id}
                  id={`customer-row-${customer.id}`}
                  className="group grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_160px_130px_100px] gap-4 items-center px-5 py-3.5 hover:bg-indigo-50/30 transition cursor-default"
                >
                  {/* Avatar */}
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${gradient} text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-xs`}
                  >
                    {getInitials(customer.customerName)}
                  </div>

                  {/* Name + phone + badge */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 truncate max-w-[180px]">
                        {customer.customerName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.cls}`}
                      >
                        {customer.lifecycleStage === 'REPEAT_CUSTOMER' && (
                          <Star className="w-2 h-2" />
                        )}
                        {badge.label}
                      </span>
                      {customer.unreadCount > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                          {customer.unreadCount} baru
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                      <span className="text-[10px] font-mono text-slate-500">
                        {customer.customerPhone}
                      </span>
                    </div>
                    {/* Mobile: last message */}
                    {customer.lastMessage && (
                      <p className="sm:hidden text-[10px] text-slate-400 truncate mt-0.5 max-w-[220px]">
                        {customer.lastMessage}
                      </p>
                    )}
                  </div>

                  {/* Last message (desktop) */}
                  <div className="hidden sm:block min-w-0">
                    <p className="text-[11px] text-slate-500 truncate leading-snug">
                      {customer.lastMessage || (
                        <span className="text-slate-300 italic">Belum ada pesan</span>
                      )}
                    </p>
                    {customer.tag && (
                      <span className="mt-0.5 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        {customer.tag}
                      </span>
                    )}
                  </div>

                  {/* Activity timestamp (desktop) */}
                  <div className="hidden sm:block">
                    <span className="text-[11px] text-slate-400 font-medium">
                      {formatRelativeTime(customer.lastMessageAt)}
                    </span>
                    <p className="text-[9px] text-slate-400 mt-0.5">{customer.assignedAgentName}</p>
                  </div>

                  {/* Actions (desktop) */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    <button
                      type="button"
                      id={`open-inbox-${customer.id}`}
                      onClick={() => onOpenInbox(customer.customerPhone)}
                      title="Buka percakapan di Inbox"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-[10px] font-bold transition cursor-pointer border border-indigo-100"
                    >
                      <Inbox className="w-3 h-3" />
                      <span>Inbox</span>
                      <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Mobile: action button inline */}
                  <div className="sm:hidden col-span-2 flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400">
                      {formatRelativeTime(customer.lastMessageAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenInbox(customer.customerPhone)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold transition cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Buka Inbox</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer summary */}
      {!isLoading && filtered.length > 0 && (
        <div className="shrink-0 px-5 py-2 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium">
            Menampilkan {filtered.length} dari {customers.length} pelanggan
          </span>
          <button
            type="button"
            onClick={() => onOpenInbox()}
            className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Buka BoonTrack Inbox</span>
            <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
