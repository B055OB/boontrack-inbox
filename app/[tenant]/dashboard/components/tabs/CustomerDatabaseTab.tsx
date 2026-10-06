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
  Calendar,
  Cake,
  Tag as TagIcon,
  X,
  Send,
  AlertCircle,
  FileText,
  CheckCircle2,
  Plus,
  HeartHandshake,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { ContactService } from '@/lib/crm/contact.service';
import { toE164, formatDisplayPhone } from '@/lib/crm/phone-utils';
import { calculateFollowUpInfo } from '@/lib/crm/followup-engine';
import { LifecycleStage, FollowUpInfo, FollowUpTriggerType } from '@/lib/crm/types';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
type FilterStage = 'ALL' | 'LEAD' | 'QUALIFIED' | 'CUSTOMER' | 'INACTIVE' | 'DUE_TODAY';

interface CustomerRow {
  id: string;
  contactId?: string;
  customerPhone: string;
  customerName: string;
  birthDate: string | null;
  lastVisitDate: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  tags: string[];
  unreadCount: number;
  lifecycleStage: string;
  totalOrders: number;
  lifetimeValue: number;
  assignedAgentName: string;
  followUp: FollowUpInfo;
}

interface CustomerDatabaseTabProps {
  tenantSlug: string;
  tenantId: string | null;
  /** Callback to deep-link into the Inbox tab for a specific conversation */
  onOpenInbox: (phone?: string) => void;
  isCrmEnabled?: boolean;
}

// -------------------------------------------------------------------
// Helpers & Constants
// -------------------------------------------------------------------
const LIFECYCLE_FILTERS: { key: FilterStage; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'ALL', label: 'Semua', icon: Users, color: 'text-slate-600' },
  { key: 'DUE_TODAY', label: 'Follow-Up Hari Ini', icon: Calendar, color: 'text-rose-600' },
  { key: 'LEAD', label: 'Lead', icon: UserPlus, color: 'text-blue-600' },
  { key: 'QUALIFIED', label: 'Qualified', icon: UserCheck, color: 'text-indigo-600' },
  { key: 'CUSTOMER', label: 'Pasien / Customer', icon: ShoppingBag, color: 'text-emerald-600' },
  { key: 'INACTIVE', label: 'Inactive', icon: Clock, color: 'text-slate-400' },
];

const LIFECYCLE_BADGE: Record<string, { label: string; cls: string }> = {
  LEAD: { label: 'Lead', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  QUALIFIED: { label: 'Qualified', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  CUSTOMER: { label: 'Pasien Aktif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REPEAT_CUSTOMER: { label: 'Pasien Rutin', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  INACTIVE: { label: 'Inactive', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const SUGGESTED_TAGS = [
  'VIP',
  'Terapi Wicara',
  'Sensori Integrasi',
  'Fisioterapi',
  'Tumbuh Kembang',
  'Konsultasi Dokter',
  'Walk-in',
  'Evaluasi H+3',
  'Evaluasi H+7',
];

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

function formatDateIndo(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const [activeFilter, setActiveFilter] = useState<FilterStage>('ALL');
  const [sortBy, setSortBy] = useState<'lastActivity' | 'name' | 'orders' | 'dueToday'>('lastActivity');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tenantName, setTenantName] = useState<string>('');

  // -------------------------------------------------------------------
  // Modal State: Tambah Pelanggan / Pasien
  // -------------------------------------------------------------------
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLifecycle, setFormLifecycle] = useState<LifecycleStage>('LEAD');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formSelectedTags, setFormSelectedTags] = useState<string[]>([]);
  const [formCustomTag, setFormCustomTag] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // -------------------------------------------------------------------
  // Modal State: Follow-Up WhatsApp
  // -------------------------------------------------------------------
  const [activeFollowUpCustomer, setActiveFollowUpCustomer] = useState<CustomerRow | null>(null);
  const [followUpMessageText, setFollowUpMessageText] = useState('');
  const [isSendingGateway, setIsSendingGateway] = useState(false);

  // Auto dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // -------------------------------------------------------------------
  // Fetch Customers (Pure Dynamic Supabase SSOT)
  // -------------------------------------------------------------------
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      // 1. Resolve canonical tenant UUID
      const tenantUuid = await ContactService.resolveTenantId(tenantId || tenantSlug);

      // Get tenant store name if available
      if (tenantUuid) {
        const { data: tData } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', tenantUuid)
          .maybeSingle();
        if (tData?.name) {
          setTenantName(tData.name);
        }
      }

      // 2. Fetch contacts from contacts table
      let contactsList: any[] = [];
      if (tenantUuid) {
        const { data: contactsData, error: contactsErr } = await supabase
          .from('contacts')
          .select('id, tenant_id, phone_e164, name, email, contact_status, lifecycle_stage, metadata, last_interaction_at, created_at, updated_at')
          .eq('tenant_id', tenantUuid)
          .order('last_interaction_at', { ascending: false });

        if (!contactsErr && Array.isArray(contactsData)) {
          contactsList = contactsData;
        }
      }

      // 3. Fetch conversations to link messages & agents
      const convOrTokens: string[] = [];
      if (tenantUuid) {
        convOrTokens.push(`tenant_id.eq.${tenantUuid}`);
      }
      if (tenantSlug) {
        convOrTokens.push(`tenant_slug.eq.${tenantSlug}`);
      }

      let convList: any[] = [];
      if (convOrTokens.length > 0) {
        const { data: convData, error: convErr } = await supabase
          .from('conversations')
          .select('id, customer_phone, customer_name, last_message, last_message_at, unread_count, assigned_agent_id')
          .or(convOrTokens.join(','))
          .order('last_message_at', { ascending: false })
          .limit(500);

        if (!convErr && Array.isArray(convData)) {
          convList = convData;
        }
      }

      // 4. Fetch orders to calculate transaction history & last visit date
      const orderOrTokens: string[] = [];
      if (tenantUuid) {
        orderOrTokens.push(`tenant_id.eq.${tenantUuid}`);
      }
      if (tenantSlug) {
        orderOrTokens.push(`tenant_slug.eq.${tenantSlug}`);
      }

      const orderStatsByPhone = new Map<string, { totalOrders: number; lifetimeValue: number; lastOrderDate: string | null }>();
      if (orderOrTokens.length > 0) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, customer_phone, gross_amount, status, created_at')
          .or(orderOrTokens.join(','))
          .limit(1000);

        if (Array.isArray(ordersData)) {
          for (const ord of ordersData) {
            const phone = toE164(ord.customer_phone);
            if (!phone) continue;
            const existing = orderStatsByPhone.get(phone) || { totalOrders: 0, lifetimeValue: 0, lastOrderDate: null };
            existing.totalOrders += 1;
            const amt = Number(ord.gross_amount || 0);
            if (!isNaN(amt)) existing.lifetimeValue += amt;
            if (!existing.lastOrderDate || new Date(ord.created_at) > new Date(existing.lastOrderDate)) {
              existing.lastOrderDate = ord.created_at;
            }
            orderStatsByPhone.set(phone, existing);
          }
        }
      }

      // 5. Merge all sources by canonical phone
      const customerMap = new Map<string, CustomerRow>();

      // First, add all registered CRM contacts
      for (const c of contactsList) {
        const phone = toE164(c.phone_e164);
        if (!phone) continue;

        const meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
        const birthDate = meta.birth_date || meta.child_birth_date || null;
        const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];
        const stats = orderStatsByPhone.get(phone);

        const lastVisitDate =
          meta.last_visit_at ||
          stats?.lastOrderDate ||
          c.last_interaction_at ||
          c.created_at ||
          null;

        const customerName = c.name || formatDisplayPhone(phone);

        const followUp = calculateFollowUpInfo({
          customerName,
          birthDate,
          lastVisitDate,
          tenantName: tenantName || 'Tumbuh Kembang Anak',
        });

        customerMap.set(phone, {
          id: c.id,
          contactId: c.id,
          customerPhone: phone,
          customerName,
          birthDate,
          lastVisitDate,
          lastMessage: '',
          lastMessageAt: c.last_interaction_at || c.created_at,
          tags,
          unreadCount: 0,
          lifecycleStage: (c.lifecycle_stage || 'LEAD').toUpperCase(),
          totalOrders: stats?.totalOrders || 0,
          lifetimeValue: stats?.lifetimeValue || 0,
          assignedAgentName: 'CS Aktif',
          followUp,
        });
      }

      // Merge / append conversations
      for (const conv of convList) {
        const phone = toE164(conv.customer_phone);
        if (!phone) continue;

        const existing = customerMap.get(phone);
        if (existing) {
          existing.lastMessage = conv.last_message || existing.lastMessage;
          existing.lastMessageAt = conv.last_message_at || existing.lastMessageAt;
          existing.unreadCount = conv.unread_count || existing.unreadCount;
          existing.assignedAgentName = conv.assigned_agent_id ? 'CS Aktif' : 'Bot / CS';
          // Re-evaluate follow up if last message gives fresh visit context
          if (!existing.lastVisitDate && conv.last_message_at) {
            existing.lastVisitDate = conv.last_message_at;
            existing.followUp = calculateFollowUpInfo({
              customerName: existing.customerName,
              birthDate: existing.birthDate,
              lastVisitDate: conv.last_message_at,
              tenantName: tenantName || 'Tumbuh Kembang Anak',
            });
          }
        } else {
          const stats = orderStatsByPhone.get(phone);
          const customerName = conv.customer_name || formatDisplayPhone(phone);
          const lastVisitDate = stats?.lastOrderDate || conv.last_message_at || null;
          const stage = (stats?.totalOrders || 0) > 1 ? 'REPEAT_CUSTOMER' : (stats?.totalOrders || 0) > 0 ? 'CUSTOMER' : 'LEAD';

          const followUp = calculateFollowUpInfo({
            customerName,
            birthDate: null,
            lastVisitDate,
            tenantName: tenantName || 'Tumbuh Kembang Anak',
          });

          customerMap.set(phone, {
            id: conv.id,
            customerPhone: phone,
            customerName,
            birthDate: null,
            lastVisitDate,
            lastMessage: conv.last_message || '',
            lastMessageAt: conv.last_message_at || null,
            tags: [],
            unreadCount: conv.unread_count || 0,
            lifecycleStage: stage,
            totalOrders: stats?.totalOrders || 0,
            lifetimeValue: stats?.lifetimeValue || 0,
            assignedAgentName: conv.assigned_agent_id ? 'CS Aktif' : 'Bot / CS',
            followUp,
          });
        }
      }

      // Append any orders-only customers not yet captured
      for (const [phone, stats] of orderStatsByPhone.entries()) {
        if (!customerMap.has(phone)) {
          const customerName = formatDisplayPhone(phone);
          const followUp = calculateFollowUpInfo({
            customerName,
            birthDate: null,
            lastVisitDate: stats.lastOrderDate,
            tenantName: tenantName || 'Tumbuh Kembang Anak',
          });

          customerMap.set(phone, {
            id: phone,
            customerPhone: phone,
            customerName,
            birthDate: null,
            lastVisitDate: stats.lastOrderDate,
            lastMessage: '',
            lastMessageAt: stats.lastOrderDate,
            tags: ['Order'],
            unreadCount: 0,
            lifecycleStage: stats.totalOrders > 1 ? 'REPEAT_CUSTOMER' : 'CUSTOMER',
            totalOrders: stats.totalOrders,
            lifetimeValue: stats.lifetimeValue,
            assignedAgentName: 'Transaksi POS',
            followUp,
          });
        }
      }

      setCustomers(Array.from(customerMap.values()));
    } catch (err) {
      console.warn('[CustomerDatabaseTab] fetch error:', err);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, tenantSlug, tenantName]);

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
  // Handle Save New Customer / Patient
  // -------------------------------------------------------------------
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Nama lengkap pelanggan / pasien wajib diisi.');
      return;
    }

    const canonicalPhone = toE164(formPhone);
    if (!canonicalPhone || canonicalPhone.length < 9) {
      setFormError('Nomor WhatsApp tidak valid. Masukkan nomor yang benar (contoh: 08123456789).');
      return;
    }

    setIsSubmittingCustomer(true);
    try {
      const tenantUuid = await ContactService.resolveTenantId(tenantId || tenantSlug);
      if (!tenantUuid) {
        throw new Error('Tenant tidak valid.');
      }

      await ContactService.createOrUpdateFullContact({
        tenantId: tenantUuid,
        name: trimmedName,
        phone: canonicalPhone,
        lifecycleStage: formLifecycle,
        birthDate: formBirthDate || null,
        tags: formSelectedTags,
        initialNotes: formNotes.trim() || undefined,
        metadata: {
          created_via: 'CRM_MODAL',
          source: formSelectedTags.includes('Walk-in') ? 'walk_in' : 'manual_entry',
          last_visit_at: new Date().toISOString(),
        },
      });

      // Reset form
      setFormName('');
      setFormPhone('');
      setFormLifecycle('LEAD');
      setFormBirthDate('');
      setFormSelectedTags([]);
      setFormCustomTag('');
      setFormNotes('');
      setIsAddModalOpen(false);

      // Toast feedback & instant refresh
      setToastMessage(`Pelanggan "${trimmedName}" berhasil disimpan ke database CRM.`);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('[CustomerDatabaseTab] Save error:', err);
      setFormError(err.message || 'Gagal menyimpan data pelanggan.');
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  // Toggle Tag selection in modal
  const handleToggleTag = (tag: string) => {
    if (formSelectedTags.includes(tag)) {
      setFormSelectedTags(formSelectedTags.filter((t) => t !== tag));
    } else {
      setFormSelectedTags([...formSelectedTags, tag]);
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = formCustomTag.trim();
    if (!trimmed) return;
    if (!formSelectedTags.includes(trimmed)) {
      setFormSelectedTags([...formSelectedTags, trimmed]);
    }
    setFormCustomTag('');
  };

  // -------------------------------------------------------------------
  // Handle Trigger Follow-up WA
  // -------------------------------------------------------------------
  const handleOpenFollowUp = (customer: CustomerRow) => {
    setActiveFollowUpCustomer(customer);
    setFollowUpMessageText(customer.followUp.templateText);
  };

  const handleSendViaWhatsAppWeb = () => {
    if (!activeFollowUpCustomer) return;
    const cleanPhone = activeFollowUpCustomer.customerPhone.replace(/\D/g, '');
    const encoded = encodeURIComponent(followUpMessageText);
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setActiveFollowUpCustomer(null);
    setToastMessage(`WhatsApp follow-up dibuka untuk ${activeFollowUpCustomer.customerName}.`);
  };

  const handleSendViaGateway = async () => {
    if (!activeFollowUpCustomer) return;
    setIsSendingGateway(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Koneksi database tidak tersedia');

      const tenantUuid = await ContactService.resolveTenantId(tenantId || tenantSlug);

      // 1. Log or schedule event to lifecycle_events
      await supabase.from('lifecycle_events').insert({
        tenant_id: tenantUuid || tenantSlug,
        customer_phone: activeFollowUpCustomer.customerPhone,
        event_type: `FOLLOWUP_${activeFollowUpCustomer.followUp.type}`,
        payload: {
          customer_name: activeFollowUpCustomer.customerName,
          rendered_message: followUpMessageText,
          trigger: activeFollowUpCustomer.followUp.label,
        },
        status: 'PROCESSED',
        scheduled_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        metadata: {
          sent_via: 'CRM_MANUAL_FOLLOWUP',
          sent_at: new Date().toISOString(),
        },
      });

      // 2. Dispatch via Evolution API if connection exists
      try {
        const { data: conn } = await supabase
          .from('whatsapp_connections')
          .select('instance_name, credential_ref')
          .or(`tenant_id.eq.${tenantUuid || tenantSlug},tenant_slug.eq.${tenantSlug}`)
          .or('status.eq.CONNECTED,status.eq.open,is_connected.eq.true')
          .maybeSingle();

        if (conn?.instance_name) {
          const { sendEvolutionTextMessage } = await import('@/lib/whatsapp/evolution-webhook-handler');
          await sendEvolutionTextMessage(
            conn.instance_name,
            activeFollowUpCustomer.customerPhone,
            followUpMessageText,
            conn.credential_ref
          );
        }
      } catch (gwErr) {
        console.warn('[CustomerDatabaseTab] Gateway dispatch fallback:', gwErr);
      }

      setToastMessage(`Pesan follow-up berhasil dikirim dan dicatat ke riwayat ${activeFollowUpCustomer.customerName}.`);
      setActiveFollowUpCustomer(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('[CustomerDatabaseTab] Send gateway error:', err);
      // Fallback: open via WhatsApp directly
      handleSendViaWhatsAppWeb();
    } finally {
      setIsSendingGateway(false);
    }
  };

  // -------------------------------------------------------------------
  // Filtered + Sorted list
  // -------------------------------------------------------------------
  const filtered = useMemo(() => {
    let list = customers;

    if (activeFilter === 'DUE_TODAY') {
      list = list.filter((c) => c.followUp.isDueToday);
    } else if (activeFilter !== 'ALL') {
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
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          c.customerPhone.includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'dueToday') {
        if (a.followUp.isDueToday && !b.followUp.isDueToday) return -1;
        if (!a.followUp.isDueToday && b.followUp.isDueToday) return 1;
      }
      if (sortBy === 'name') return a.customerName.localeCompare(b.customerName, 'id');
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      const da = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const db = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return db - da;
    });
  }, [customers, activeFilter, searchQuery, sortBy]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: customers.length,
      DUE_TODAY: customers.filter((c) => c.followUp.isDueToday).length,
    };
    for (const c of customers) {
      const stage =
        c.lifecycleStage === 'REPEAT_CUSTOMER' ? 'CUSTOMER' : c.lifecycleStage;
      map[stage] = (map[stage] || 0) + 1;
    }
    return map;
  }, [customers]);

  const SORT_LABELS: Record<string, string> = {
    lastActivity: 'Aktivitas Terbaru',
    dueToday: 'Follow-Up Hari Ini',
    name: 'Nama (A\u2013Z)',
    orders: 'Total Pesanan / Sesi',
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 right-4 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-200 bg-white shrink-0 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xs text-white">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 leading-tight">
                  Database Pelanggan &amp; Pasien
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Lifecycle CRM
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {isLoading
                  ? 'Memuat database...'
                  : `${customers.length.toLocaleString('id-ID')} kontak terdaftar di database ${tenantName || 'tenant'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Button Tambah Pelanggan / Pasien */}
            <button
              type="button"
              id="btn-add-customer"
              onClick={() => {
                setFormError(null);
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Tambah Pelanggan / Pasien</span>
            </button>

            {/* Sort dropdown */}
            <div className="relative" data-sort-dropdown>
              <button
                type="button"
                onClick={() => setIsSortOpen((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
              >
                <Filter className="w-3 h-3 text-slate-400" />
                <span>{SORT_LABELS[sortBy]}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {isSortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl p-1 z-30 min-w-[170px] animate-in fade-in zoom-in-95 duration-100">
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSortBy(key as any);
                        setIsSortOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        sortBy === key
                          ? 'bg-indigo-50 text-indigo-700 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
              title="Refresh database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            id="customer-search-input"
            type="text"
            placeholder="Cari nama pasien, nomor WhatsApp, atau label/tag..."
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                activeFilter === key
                  ? key === 'DUE_TODAY'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon className={`w-3 h-3 ${activeFilter === key ? 'text-white' : color}`} />
              <span>{label}</span>
              {counts[key] !== undefined && counts[key] > 0 && (
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    activeFilter === key
                      ? 'bg-white/20 text-white'
                      : key === 'DUE_TODAY'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-200 text-slate-700'
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
          <div className="flex flex-col items-center justify-center h-56 gap-3 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold text-slate-500">
              Memuat database pasien &amp; riwayat kontak...
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <Users className="w-7 h-7" />
            </div>
            <div className="max-w-md">
              <p className="text-sm font-bold text-slate-800">
                {searchQuery
                  ? 'Tidak ada hasil pencarian'
                  : activeFilter === 'DUE_TODAY'
                  ? 'Tidak ada follow-up yang jatuh tempo hari ini'
                  : 'Belum ada data pelanggan'}
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {searchQuery
                  ? `Tidak ada kontak yang cocok dengan "${searchQuery}". Coba kata kunci lain.`
                  : activeFilter === 'DUE_TODAY'
                  ? 'Semua jadwal evaluasi H+3, H+7, dan hari ulang tahun pasien terkendali rapi.'
                  : 'Mulai input data pasien baru secara manual, atau catat transaksi walk-in pada kasir Quick POS.'}
              </p>
              {!searchQuery && activeFilter !== 'DUE_TODAY' && (
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Tambah Pasien / Pelanggan Pertama</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Table Header Row */}
            <div className="hidden lg:grid grid-cols-[auto_1.5fr_1.3fr_1.2fr_130px_160px] gap-4 px-5 py-2.5 bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
              <div className="w-9" />
              <div>Pasien / Pelanggan</div>
              <div>Follow-up Berikutnya</div>
              <div>Pesan Terakhir / Catatan</div>
              <div>Aktivitas</div>
              <div className="text-right">Aksi Cepat</div>
            </div>

            {filtered.map((customer) => {
              const badge = LIFECYCLE_BADGE[customer.lifecycleStage] ?? LIFECYCLE_BADGE['LEAD'];
              const gradient = getAvatarGradient(customer.customerPhone);
              const followUp = customer.followUp;

              return (
                <div
                  key={customer.id}
                  id={`customer-row-${customer.id}`}
                  className="group grid grid-cols-1 lg:grid-cols-[auto_1.5fr_1.3fr_1.2fr_130px_160px] gap-3 lg:gap-4 items-center px-5 py-3.5 hover:bg-indigo-50/40 transition cursor-default bg-white"
                >
                  {/* Avatar */}
                  <div className="hidden lg:flex">
                    <div
                      className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${gradient} text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-2xs`}
                    >
                      {getInitials(customer.customerName)}
                    </div>
                  </div>

                  {/* Name + phone + badge */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="lg:hidden">
                        <div
                          className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${gradient} text-white font-black text-[10px] flex items-center justify-center shrink-0 shadow-2xs`}
                        >
                          {getInitials(customer.customerName)}
                        </div>
                      </div>
                      <span className="text-xs font-black text-slate-900 truncate max-w-[200px]">
                        {customer.customerName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.cls}`}
                      >
                        {customer.lifecycleStage === 'REPEAT_CUSTOMER' && (
                          <Star className="w-2.5 h-2.5 fill-violet-600" />
                        )}
                        {badge.label}
                      </span>
                      {customer.unreadCount > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                          {customer.unreadCount} baru
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                        <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span>{formatDisplayPhone(customer.customerPhone)}</span>
                      </div>

                      {customer.birthDate && (
                        <div className="flex items-center gap-1 text-[9px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          <Cake className="w-2.5 h-2.5" />
                          <span>Lahir: {formatDateIndo(customer.birthDate)}</span>
                        </div>
                      )}
                    </div>

                    {/* Tag list */}
                    {customer.tags && customer.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {customer.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Follow-up Berikutnya (H+3, H+7, Birthday) */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${followUp.badgeCls}`}
                      >
                        {followUp.type === 'BIRTHDAY' ? (
                          <Cake className="w-3 h-3 text-rose-600" />
                        ) : (
                          <Calendar className="w-3 h-3" />
                        )}
                        <span>{followUp.label}</span>
                      </span>
                    </div>
                    {customer.lastVisitDate && (
                      <p className="text-[10px] text-slate-400 font-medium">
                        Kunjungan Terakhir: {formatDateIndo(customer.lastVisitDate)}
                      </p>
                    )}
                  </div>

                  {/* Pesan Terakhir */}
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-600 truncate leading-snug">
                      {customer.lastMessage || (
                        <span className="text-slate-300 italic">Belum ada obrolan pesan</span>
                      )}
                    </p>
                    {customer.totalOrders > 0 && (
                      <span className="text-[9px] font-semibold text-indigo-700 block mt-0.5">
                        {customer.totalOrders} Transaksi • Rp {customer.lifetimeValue.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                  {/* Aktivitas */}
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-500 font-medium block">
                      {formatRelativeTime(customer.lastMessageAt || customer.lastVisitDate)}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      {customer.assignedAgentName}
                    </span>
                  </div>

                  {/* Aksi Cepat */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 lg:pt-0">
                    <button
                      type="button"
                      id={`btn-followup-${customer.id}`}
                      onClick={() => handleOpenFollowUp(customer)}
                      title="Follow-up via WhatsApp"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold transition border border-emerald-200 cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <MessageSquare className="w-3 h-3 text-emerald-600" />
                      <span>Follow Up WA</span>
                    </button>

                    <button
                      type="button"
                      id={`open-inbox-${customer.id}`}
                      onClick={() => onOpenInbox(customer.customerPhone)}
                      title="Buka percakapan di Inbox"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold transition border border-indigo-200 cursor-pointer"
                    >
                      <Inbox className="w-3 h-3 text-indigo-600" />
                      <span className="hidden sm:inline">Inbox</span>
                      <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Summary */}
      {!isLoading && filtered.length > 0 && (
        <div className="shrink-0 px-5 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 font-medium">
            Menampilkan <strong className="text-slate-800">{filtered.length}</strong> dari{' '}
            <strong className="text-slate-800">{customers.length}</strong> pasien / pelanggan
          </span>
          <button
            type="button"
            onClick={() => onOpenInbox()}
            className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Buka BoonTrack Inbox Lengkap</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: Tambah Pelanggan / Pasien                                     */}
      {/* =================================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Tambah Pelanggan / Pasien Baru
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Simpan profil, keluhan, dan tanggal lahir untuk otomasi follow-up
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveCustomer} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nama Lengkap */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nama Lengkap Pasien / Klien <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ananda Rayhan / Bunda Sinta"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nomor WhatsApp <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 08123456789 atau 628123456789"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Otomatis dikonversi ke format standar E.164 (+62) untuk sinkronisasi chat.
                </p>
              </div>

              {/* Lifecycle Stage */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Status Lifecycle Pasien / Pelanggan
                </label>
                <select
                  value={formLifecycle}
                  onChange={(e) => setFormLifecycle(e.target.value as LifecycleStage)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="LEAD">Lead (Baru Bertanya / Konsultasi Awal)</option>
                  <option value="QUALIFIED">Qualified (Tertarik &amp; Menunggu Jadwal Sesi)</option>
                  <option value="CUSTOMER">Customer / Pasien Aktif (Sudah Kunjungan/Sesi)</option>
                  <option value="INACTIVE">Inactive (Tidak Aktif / Selesai Program)</option>
                </select>
              </div>

              {/* Tanggal Lahir / Tanggal Lahir Anak */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Tanggal Lahir Anak / Pasien</span>
                  <span className="text-[10px] font-normal text-slate-400">Opsional (Ulang Tahun)</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formBirthDate}
                    onChange={(e) => setFormBirthDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Digunakan untuk Birthday Reminder otomatis dan ucapan selamat ulang tahun personal.
                </p>
              </div>

              {/* Tags Relasional */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tags &amp; Kategori Layanan
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {SUGGESTED_TAGS.map((tag) => {
                    const isSelected = formSelectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Tambah tag kustom..."
                    value={formCustomTag}
                    onChange={(e) => setFormCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 text-xs transition cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* Catatan Awal / Keluhan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Catatan Awal / Keluhan Utama</span>
                  <span className="text-[10px] font-normal text-slate-400">Opsional</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Keterlambatan bicara 2.5 tahun, kontak mata minim, evaluasi stimulasi sensori integrasi..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCustomer}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isSubmittingCustomer ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan ke CRM...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Simpan Pelanggan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: WhatsApp Follow-Up Quick Action                               */}
      {/* =================================================================== */}
      {activeFollowUpCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>Follow-Up WhatsApp</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                      {activeFollowUpCustomer.followUp.label}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Kirim pesan evaluasi ramah untuk {activeFollowUpCustomer.customerName} (
                    {formatDisplayPhone(activeFollowUpCustomer.customerPhone)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveFollowUpCustomer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Quick Template Switcher */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  Pilih Cepat Template Pesan
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFollowUpMessageText(
                        `Halo Ayah/Bunda ${activeFollowUpCustomer.customerName}, bagaimana perkembangan si kecil setelah sesi kunjungan 3 hari lalu di ${tenantName || 'Klinik'}? Apakah ada respon atau kondisi baru yang ingin dikonsultasikan kembali? Kami siap membantu evaluasi 🙏`
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                  >
                    Template H+3 (Evaluasi Kondisi)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFollowUpMessageText(
                        `Halo Ayah/Bunda ${activeFollowUpCustomer.customerName}, sudah 1 minggu sejak sesi kunjungan terakhir. Untuk memastikan kemajuan stimulasi dan tumbuh kembang si kecil berjalan optimal, apakah ingin menjadwalkan sesi evaluasi lanjutan minggu ini? 😊`
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                  >
                    Template H+7 (Sesi Lanjutan)
                  </button>

                  {activeFollowUpCustomer.birthDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setFollowUpMessageText(
                          `Halo Ayah/Bunda ${activeFollowUpCustomer.customerName}, Selamat Ulang Tahun untuk si kecil! 🎂🎉 Semoga senantiasa sehat, tumbuh cerdas, dan penuh keceriaan. Kami dari ${tenantName || 'Klinik Tumbuh Kembang'} mendoakan yang terbaik. Spesial di hari bahagia ini, kami siapkan hadiah voucher spesial 🎁✨`
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 cursor-pointer"
                    >
                      Template Birthday Reminder 🎂
                    </button>
                  )}
                </div>
              </div>

              {/* Message Textarea */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Isi Pesan WhatsApp (Dapat Disesuaikan)
                </label>
                <textarea
                  rows={6}
                  value={followUpMessageText}
                  onChange={(e) => setFollowUpMessageText(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition resize-none leading-relaxed text-xs"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-[11px] text-slate-500">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Kanal Pengiriman Fleksibel:</span>
                </p>
                <p>
                  Gunakan <strong>Kirim via WhatsApp Langsung</strong> untuk membuka aplikasi WA Web / Desktop secara instan, atau <strong>Kirim via BoonTrack Gateway</strong> untuk pengiriman otomatis via nomor CS toko.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveFollowUpCustomer(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer text-center"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleSendViaWhatsAppWeb}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Buka WhatsApp (Web/App)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendViaGateway}
                  disabled={isSendingGateway}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isSendingGateway ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengirim Gateway...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Kirim Otomatis Gateway</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
