"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Share2,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Search,
  ArrowUpRight,
  Send,
  Phone,
  FileText,
  BadgePercent,
  Coins,
  ChevronRight,
  Filter,
  CheckCircle,
  UserCheck,
  XCircle,
  MessageCircle,
  Sparkles,
  X
} from 'lucide-react';
import ResellerComplianceModal from '../ResellerComplianceModal';

interface ResellerMember {
  id: string;
  code: string;
  name: string;
  phone: string;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'FROZEN';
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_value: number;
  order_count?: number;
  total_commission_earned?: number;
  total_commission_paid?: number;
  total_commission?: number;
  created_at: string;
}

interface ResellerCommissionRecord {
  id: string;
  reseller_id: string;
  order_id: string;
  commission_base: number;
  commission_rate: number;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';
  earned_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  reversed_at?: string | null;
  payout_notes?: string | null;
  created_at?: string;
  store_resellers?: {
    id: string;
    code: string;
    name: string;
    phone: string;
  };
  orders?: {
    id: string;
    order_number?: string;
    gross_amount?: number;
    customer_name?: string;
    product_title?: string;
    created_at?: string;
    payment_status?: string;
  };
}

interface ResellerApplicationRecord {
  id: string;
  tenant_id: string;
  creator_id: string;
  creator_handle: string;
  product_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  commission_type: 'FIXED' | 'PERCENTAGE';
  commission_amount: number;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string;
    bio?: string;
    whatsapp?: string;
  };
  product?: {
    id: string;
    title: string;
    slug: string;
    price: number;
    promo_price?: number;
    image_url?: string;
  };
  estimated_commission_nominal?: number;
  commission_label?: string;
}

interface ResellerTabProps {
  tenantSlug: string;
  tenantData?: any;
}

export default function ResellerTab({ tenantSlug, tenantData }: ResellerTabProps) {
  // ── Protection Gate State ──
  const [isResellerEnabled, setIsResellerEnabled] = useState<boolean>(() => {
    return Boolean(tenantData?.reseller_enabled || tenantData?.metadata?.reseller_settings?.enabled);
  });
  const [resellerTosAcceptedAt, setResellerTosAcceptedAt] = useState<string | null>(() => {
    return tenantData?.reseller_tos_accepted_at || tenantData?.metadata?.reseller_settings?.tos_accepted_at || null;
  });
  const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);

  // ── Workspace State ──
  const [activeSubView, setActiveSubView] = useState<'members' | 'commissions' | 'applications'>('members');
  const [resellers, setResellers] = useState<ResellerMember[]>([]);
  const [commissions, setCommissions] = useState<ResellerCommissionRecord[]>([]);
  const [applications, setApplications] = useState<ResellerApplicationRecord[]>([]);
  const [applicationFilter, setApplicationFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [mutatingAppId, setMutatingAppId] = useState<string | null>(null);
  const [appMutationFeedback, setAppMutationFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [metrics, setMetrics] = useState({
    active_resellers: 0,
    frozen_resellers: 0,
    total_orders: 0,
    total_gmv: 0,
    total_outstanding_commission: 0,
    total_paid_commission: 0,
  });

  const [entitlement, setEntitlement] = useState<{
    tier: string;
    max_active_resellers: number;
    current_quota: number;
    active_count: number;
    frozen_count: number;
    upgrade_url: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commissionFilter, setCommissionFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');

  // ── Add Reseller Modal State ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formCommissionType, setFormCommissionType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [formCommissionValue, setFormCommissionValue] = useState<number>(10);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [upgradeUrlPrompt, setUpgradeUrlPrompt] = useState<string | null>(null);

  // ── Member status update state ──
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  // ── Copy feedback state ──
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // ── Settle/Mark as Paid state ──
  const [settlingId, setSettlingId] = useState<string | null>(null);

  // Check initial tenant status if not loaded
  useEffect(() => {
    if (tenantData) {
      const enabled = Boolean(tenantData.reseller_enabled || tenantData.metadata?.reseller_settings?.enabled);
      setIsResellerEnabled(enabled);
      setResellerTosAcceptedAt(tenantData.reseller_tos_accepted_at || tenantData.metadata?.reseller_settings?.tos_accepted_at || null);
    }
  }, [tenantData]);

  // Load Reseller Data
  const loadData = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [membersRes, commsRes, appsRes] = await Promise.all([
        fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/members`),
        fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/commissions`),
        fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/resellers`),
      ]);

      if (membersRes.ok) {
        const mData = await membersRes.json();
        if (mData.success && Array.isArray(mData.resellers)) {
          setResellers(mData.resellers);
          if (mData.entitlement) {
            setEntitlement(mData.entitlement);
          }
        }
      }

      if (commsRes.ok) {
        const cData = await commsRes.json();
        if (cData.success && Array.isArray(cData.commissions)) {
          setCommissions(cData.commissions);
          if (cData.metrics) {
            setMetrics({
              active_resellers: cData.metrics.active_resellers || 0,
              frozen_resellers: cData.metrics.frozen_resellers || 0,
              total_orders: cData.metrics.total_orders || 0,
              total_gmv: cData.metrics.total_gmv || 0,
              total_outstanding_commission: cData.metrics.total_outstanding_commission || 0,
              total_paid_commission: cData.metrics.total_paid_commission || 0,
            });
          }
        }
      }

      if (appsRes.ok) {
        const aData = await appsRes.json();
        if (aData.success && Array.isArray(aData.partnerships)) {
          setApplications(aData.partnerships);
        }
      }
    } catch (err) {
      console.warn('[ResellerTab] Load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isResellerEnabled) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [tenantSlug, isResellerEnabled]);

  // Copy helper
  const handleCopyLink = (code: string) => {
    const storeBase = typeof window !== 'undefined' ? window.location.origin : 'https://shop.boontrack.com';
    const link = `${storeBase}/${tenantSlug}?r=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // WhatsApp Share helper
  const handleShareToWhatsApp = (reseller: ResellerMember) => {
    const storeBase = typeof window !== 'undefined' ? window.location.origin : 'https://shop.boontrack.com';
    const link = `${storeBase}/${tenantSlug}?r=${reseller.code}`;
    const cleanPhone = reseller.phone.replace(/[^0-9]/g, '');
    const targetPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone.startsWith('8') ? '62' + cleanPhone : cleanPhone;
    
    const message = `Halo ${reseller.name}!\n\nBerikut tautan resmi toko untuk penjualan Anda:\n👉 ${link}\n\nSetiap pesanan yang masuk melalui link ini otomatis tercatat dengan kode rujukan Anda [${reseller.code}] dan komisi Anda akan dihitung secara transparan. Sukses selalu!`;
    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  // Submit New Reseller
  const handleCreateReseller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      setFormError('Nama dan nomor WhatsApp wajib diisi.');
      return;
    }
    setFormError(null);
    setUpgradeUrlPrompt(null);
    setIsSubmittingNew(true);

    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim(),
          code: formCode.trim() || undefined,
          commission_type: formCommissionType,
          commission_value: formCommissionValue,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setIsAddModalOpen(false);
        setFormName('');
        setFormPhone('');
        setFormCode('');
        setFormCommissionValue(10);
        setUpgradeUrlPrompt(null);
        await loadData(true);
      } else {
        if (data.error === 'RESELLER_LIMIT_REACHED') {
          setFormError(data.message || 'Batas kuota mitra reseller aktif telah tercapai.');
          setUpgradeUrlPrompt(data.upgrade_url || '/dashboard/billing?feature=reseller_starter');
        } else {
          setFormError(data.error || 'Gagal menambahkan reseller baru.');
          setUpgradeUrlPrompt(null);
        }
      }
    } catch (err: any) {
      setFormError('Terjadi kesalahan jaringan.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Toggle member status (ACTIVE / INACTIVE)
  const handleToggleMemberStatus = async (member: ResellerMember, newStatus: 'ACTIVE' | 'INACTIVE') => {
    setUpdatingMemberId(member.id);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await loadData(true);
      } else {
        alert(data.message || data.error || 'Gagal mengubah status mitra reseller.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  // Settle commission
  const handleSettleCommission = async (commId: string) => {
    setSettlingId(commId);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/commissions/${encodeURIComponent(commId)}/settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_notes: 'Transfer manual bank oleh merchant' }),
      });

      if (res.ok) {
        await loadData(true);
      }
    } catch (err) {
      console.warn('[ResellerTab] Settle error:', err);
    } finally {
      setSettlingId(null);
    }
  };

  // Handle Kurasi Application Status Mutation
  const handleMutateApplication = async (appId: string, targetStatus: 'APPROVED' | 'REJECTED' | 'REVOKED') => {
    setMutatingAppId(appId);
    setAppMutationFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/resellers/${encodeURIComponent(appId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const result = await res.json();
      if (result.success) {
        setAppMutationFeedback({
          type: 'success',
          message:
            targetStatus === 'APPROVED'
              ? 'Kemitraan berhasil disetujui! Kreator kini dapat membagikan link produk toko Anda.'
              : targetStatus === 'REJECTED'
              ? 'Permohonan kemitraan berhasil ditolak.'
              : 'Akses kemitraan reseller berhasil dicabut.',
        });
        await loadData(true);
      } else {
        setAppMutationFeedback({
          type: 'error',
          message: result.message || 'Gagal mengubah status permohonan.',
        });
      }
    } catch (err: any) {
      setAppMutationFeedback({
        type: 'error',
        message: err?.message || 'Terjadi kesalahan sistem.',
      });
    } finally {
      setMutatingAppId(null);
    }
  };

  // Filtered lists
  const filteredResellers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return Array.isArray(resellers) ? resellers : [];
    return (Array.isArray(resellers) ? resellers : []).filter(r => 
      Boolean(r.name && r.name.toLowerCase().includes(q)) || 
      Boolean(r.code && r.code.toLowerCase().includes(q)) || 
      Boolean(r.phone && r.phone.includes(q))
    );
  }, [resellers, searchQuery]);

  const filteredCommissions = useMemo(() => {
    return (Array.isArray(commissions) ? commissions : []).filter(c => {
      if (commissionFilter === 'PENDING' && c.status === 'PAID') return false;
      if (commissionFilter === 'PAID' && c.status !== 'PAID') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const rName = c.store_resellers?.name?.toLowerCase() || '';
        const rCode = c.store_resellers?.code?.toLowerCase() || '';
        const oId = c.orders?.order_number?.toLowerCase() || (c.order_id ? c.order_id.toLowerCase() : '');
        return rName.includes(q) || rCode.includes(q) || oId.includes(q);
      }
      return true;
    });
  }, [commissions, commissionFilter, searchQuery]);

  const filteredApplications = useMemo(() => {
    return (Array.isArray(applications) ? applications : []).filter((app) => {
      if (applicationFilter !== 'ALL' && app.status !== applicationFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const handle = (app.creator_handle || '').toLowerCase();
        const cName = (app.creator?.display_name || '').toLowerCase();
        const pTitle = (app.product?.title || '').toLowerCase();
        return handle.includes(q) || cName.includes(q) || pTitle.includes(q);
      }
      return true;
    });
  }, [applications, applicationFilter, searchQuery]);

  // ─────────────────────────────────────────────────────────────
  // 1. PINTU GERBANG: JIKA BELUM AKTIF / BELUM ACCEPT ToS
  // ─────────────────────────────────────────────────────────────
  if (!isResellerEnabled) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Banner Hero Aktivasi */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-3xl p-8 border border-indigo-500/30 shadow-xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-2xl space-y-4 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-semibold">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Modul Distribusi Toko Multi-Tenant</span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
              Buka Potensi Penjualan Toko dengan Pasukan Reseller Anda Sendiri
            </h1>

            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Aktifkan sistem pelacakan otomatis berformat <code className="text-amber-400 font-mono">?r=[KODE]</code>. 
              Reseller Anda membagikan tautan toko, BoonTrack mencatat atribusi dan menghitung komisi secara transparan, sementara 100% uang pembayaran pembeli langsung masuk ke rekening/QRIS Anda.
            </p>

            {/* Prinsip Non-Custodial & Anti-Piramida */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">100% Non-Custodial:</strong>
                  <span className="text-slate-400 text-[11px]">BoonTrack tidak memegang uang Anda. Payout komisi dibayarkan langsung secara mandiri.</span>
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Regulasi Sah RI:</strong>
                  <span className="text-slate-400 text-[11px]">Sistem penjualan langsung 1-tingkat yang mematuhi UU Perdagangan RI &amp; anti-piramida.</span>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setIsComplianceModalOpen(true)}
                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs md:text-sm shadow-lg shadow-emerald-500/25 transition active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Setujui Kepatuhan Hukum &amp; Aktifkan Reseller</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Kepatuhan Legal */}
        <ResellerComplianceModal
          isOpen={isComplianceModalOpen}
          onClose={() => setIsComplianceModalOpen(false)}
          tenantSlug={tenantSlug}
          onSuccess={(acceptedAt) => {
            setIsResellerEnabled(true);
            setResellerTosAcceptedAt(acceptedAt);
            loadData();
          }}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. WORKSPACE OPERASIONAL RESELLER (AKTIF)
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle className="w-3 h-3" /> PROGRAM RESELLER AKTIF
            </span>
            {resellerTosAcceptedAt && (
              <span className="text-[11px] text-slate-400 font-mono">
                ToS disetujui {new Date(resellerTosAcceptedAt).toLocaleDateString('id-ID')}
              </span>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight mt-1">
            Mitra Reseller &amp; Ledger Komisi Toko
          </h1>
          <p className="text-xs text-slate-500">
            Kelola pasukan penjual toko Anda, pantau omzet rujukan, dan selesaikan hak komisi mitra secara transparan.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-indigo-600/25 transition cursor-pointer active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Mitra Reseller</span>
          </button>
        </div>
      </div>

      {/* A. Bar Metrik Ringkasan (Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold">Reseller Aktif</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              entitlement?.tier === 'UNLIMITED'
                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : entitlement?.tier === 'SCALE'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : entitlement?.tier === 'STARTER'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {entitlement?.tier || 'FREE'}
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 flex items-baseline gap-1">
            {metrics.active_resellers}
            <span className="text-xs font-normal text-slate-400">
              / {entitlement?.max_active_resellers === 999999 ? '∞' : (entitlement?.max_active_resellers ?? 5)} kuota
            </span>
          </div>
          {metrics.frozen_resellers > 0 && (
            <div className="text-[10px] text-amber-600 font-semibold flex items-center gap-1 pt-0.5">
              <span>❄️ {metrics.frozen_resellers} mitra dibekukan</span>
            </div>
          )}
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold">Order Rujukan</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {metrics.total_orders} <span className="text-xs font-normal text-slate-400">pesanan</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold">Total GMV Reseller</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-base md:text-lg font-black text-emerald-600 font-mono truncate">
            Rp {Number(metrics.total_gmv || 0).toLocaleString('id-ID')}
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold">Kewajiban Komisi (Siap Ditransfer)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-base md:text-lg font-black text-amber-700 font-mono truncate">
            Rp {Number(metrics.total_outstanding_commission || 0).toLocaleString('id-ID')}
          </div>
        </div>

        {/* Metric 5 */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs space-y-1 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold">Komisi Selesai (Paid)</span>
            <CheckCircle2 className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-base md:text-lg font-black text-slate-700 font-mono truncate">
            Rp {Number(metrics.total_paid_commission || 0).toLocaleString('id-ID')}
          </div>
        </div>
      </div>

      {/* Sub-view Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveSubView('members')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubView === 'members'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Daftar Mitra ({resellers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('commissions')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubView === 'commissions'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Buku Besar Komisi / Ledger ({commissions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('applications')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubView === 'applications'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Permohonan Kurasi</span>
            {applications.filter((a) => a.status === 'PENDING').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
                {applications.filter((a) => a.status === 'PENDING').length} Baru
              </span>
            )}
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-2">
          {activeSubView === 'commissions' && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setCommissionFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${commissionFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setCommissionFilter('PENDING')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${commissionFilter === 'PENDING' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500'}`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setCommissionFilter('PAID')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${commissionFilter === 'PAID' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
              >
                Paid
              </button>
            </div>
          )}

          {activeSubView === 'applications' && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setApplicationFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${applicationFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                Semua ({applications.length})
              </button>
              <button
                type="button"
                onClick={() => setApplicationFilter('PENDING')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${applicationFilter === 'PENDING' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500'}`}
              >
                Menunggu ({applications.filter((a) => a.status === 'PENDING').length})
              </button>
              <button
                type="button"
                onClick={() => setApplicationFilter('APPROVED')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${applicationFilter === 'APPROVED' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
              >
                Disetujui ({applications.filter((a) => a.status === 'APPROVED').length})
              </button>
              <button
                type="button"
                onClick={() => setApplicationFilter('REJECTED')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${applicationFilter === 'REJECTED' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500'}`}
              >
                Ditolak
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeSubView === 'applications'
                  ? 'Cari nama atau produk...'
                  : 'Cari nama, kode, atau order...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-800 text-xs w-48 sm:w-56 focus:outline-none focus:border-indigo-500 bg-slate-950 text-white placeholder-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Mutation Feedback Banner */}
      {appMutationFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between animate-in fade-in duration-200 ${
            appMutationFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {appMutationFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{appMutationFeedback.message}</span>
          </div>
          <button
            onClick={() => setAppMutationFeedback(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          C. TABEL DAFTAR RESELLER
         ───────────────────────────────────────────────────────────── */}
      {activeSubView === 'members' && (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xs">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Memuat daftar mitra reseller...
            </div>
          ) : filteredResellers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-slate-700 font-bold text-sm">Belum Ada Mitra Reseller</div>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                Tambahkan mitra reseller pertama Anda untuk mulai membagikan tautan rujukan toko dan memperluas omzet.
              </p>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
              >
                <UserPlus className="w-4 h-4" /> Tambah Mitra Sekarang
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-200 bg-slate-900/50">
                <thead className="bg-slate-900/60 border-b border-slate-800/60 text-slate-400 font-medium uppercase text-xs tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Mitra Reseller</th>
                    <th className="py-3 px-4">Kode Unik</th>
                    <th className="py-3 px-4">Skema Komisi</th>
                    <th className="py-3 px-4 text-center">Pesanan</th>
                    <th className="py-3 px-4 text-right">Akumulasi Komisi</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredResellers.map((reseller) => {
                    const isCopied = copiedCode === reseller.code;
                    return (
                      <tr key={reseller.id} className="border-b border-slate-800/60 text-slate-200 text-sm hover:bg-slate-800/40 transition-colors">
                        {/* Nama & Kontak */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{reseller.name}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {reseller.phone}
                          </div>
                        </td>

                        {/* Kode Unik */}
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg text-xs">
                            {reseller.code}
                          </span>
                        </td>

                        {/* Skema Komisi */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1 font-semibold text-slate-800">
                            {reseller.commission_type === 'PERCENTAGE' ? (
                              <>
                                <BadgePercent className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{reseller.commission_value}% per omzet</span>
                              </>
                            ) : (
                              <>
                                <Coins className="w-3.5 h-3.5 text-blue-600" />
                                <span>Rp {Number(reseller.commission_value).toLocaleString('id-ID')} flat</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Total Order */}
                        <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                          {reseller.order_count || 0}
                        </td>

                        {/* Akumulasi Komisi */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          Rp {Number(reseller.total_commission || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          {reseller.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aktif
                            </span>
                          ) : reseller.status === 'FROZEN' ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 cursor-help"
                              title="Dibekukan secara aman saat downgrade paket. Riwayat komisi utuh. Upgrade paket untuk mengaktifkan kembali."
                            >
                              ❄️ Beku (Kuota)
                            </span>
                          ) : reseller.status === 'SUSPENDED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Ditangguhkan
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              Nonaktif
                            </span>
                          )}
                        </td>

                        {/* Aksi Cepat */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Toggle Aktif / Nonaktif */}
                            {reseller.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                disabled={updatingMemberId === reseller.id}
                                onClick={() => handleToggleMemberStatus(reseller, 'INACTIVE')}
                                className="px-2 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                                title="Nonaktifkan mitra untuk mengosongkan slot kuota aktif"
                              >
                                {updatingMemberId === reseller.id ? '...' : 'Nonaktifkan'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={updatingMemberId === reseller.id}
                                onClick={() => handleToggleMemberStatus(reseller, 'ACTIVE')}
                                className="px-2 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                                title="Aktifkan kembali mitra reseller (memeriksa kuota aktif)"
                              >
                                {updatingMemberId === reseller.id ? '...' : 'Aktifkan'}
                              </button>
                            )}

                            {/* Salin Link */}
                            <button
                              type="button"
                              onClick={() => handleCopyLink(reseller.code)}
                              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                                isCopied
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                              title={reseller.status === 'FROZEN' ? 'Salin link toko (pesanan tetap diproses reguler tanpa komisi saat frozen)' : 'Salin Link Jualan Toko'}
                            >
                              {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                              <span>{isCopied ? 'Tersalin' : 'Salin Link'}</span>
                            </button>

                            {/* Bagikan ke WA */}
                            <button
                              type="button"
                              onClick={() => handleShareToWhatsApp(reseller)}
                              className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer"
                              title="Kirim Link ke WhatsApp Reseller"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          D. TABEL RIWAYAT KOMISI & SETTLEMENT MANUAL (LEDGER VIEW)
         ───────────────────────────────────────────────────────────── */}
      {activeSubView === 'commissions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Memuat buku besar komisi...
            </div>
          ) : filteredCommissions.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Coins className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-slate-700 font-bold text-sm">Belum Ada Catatan Komisi</div>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                Komisi baru akan otomatis tercatat ketika pesanan dengan kode rujukan reseller berhasil lunas (PAYMENT_CONFIRMED) atau diselesaikan (COD_SETTLED).
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-200 bg-slate-900/50">
                <thead className="bg-slate-900/60 border-b border-slate-800/60 text-slate-400 font-medium uppercase text-xs tracking-wider">
                  <tr>
                    <th className="py-3 px-4">No Order &amp; Waktu</th>
                    <th className="py-3 px-4">Mitra Reseller</th>
                    <th className="py-3 px-4">Nilai Order (Base)</th>
                    <th className="py-3 px-4">Hak Komisi</th>
                    <th className="py-3 px-4 text-center">Status Settlement</th>
                    <th className="py-3 px-4 text-right">Aksi Merchant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredCommissions.map((comm) => {
                    const isSettling = settlingId === comm.id;
                    const isPaid = comm.status === 'PAID';

                    return (
                      <tr key={comm.id} className="border-b border-slate-800/60 text-slate-200 text-sm hover:bg-slate-800/40 transition-colors">
                        {/* No Order & Waktu */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-white">
                            {comm.orders?.order_number || comm.order_id}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(comm.earned_at || comm.created_at || '').toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        {/* Mitra Reseller */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">
                            {comm.store_resellers?.name || 'Mitra Reseller'}
                          </div>
                          <div className="text-[11px] font-mono text-indigo-600 font-semibold">
                            [{comm.store_resellers?.code}]
                          </div>
                        </td>

                        {/* Nilai Order */}
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                          Rp {Number(comm.commission_base || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Hak Komisi */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-emerald-600 text-sm">
                            Rp {Number(comm.commission_amount || 0).toLocaleString('id-ID')}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {comm.commission_type === 'PERCENTAGE'
                              ? `${(comm.commission_rate * 100).toFixed(0)}% snapshot`
                              : 'Flat per pesanan'}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> LUNAS (PAID)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" /> PENDING TRANSFER
                            </span>
                          )}
                          {comm.paid_at && (
                            <div className="text-[9px] text-slate-400 mt-0.5 font-mono">
                              Ditransfer {new Date(comm.paid_at).toLocaleDateString('id-ID')}
                            </div>
                          )}
                        </td>

                        {/* Aksi Merchant */}
                        <td className="py-3.5 px-4 text-right">
                          {isPaid ? (
                            <span className="text-[11px] text-slate-400 font-medium italic">
                              Sudah Diselesaikan
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSettleCommission(comm.id)}
                              disabled={isSettling}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                              title="Tandai bahwa merchant telah mentransfer komisi ini secara manual"
                            >
                              {isSettling ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              <span>Tandai Sudah Ditransfer</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          D. TABEL PERMOHONAN RESELLER / KURASI KREATOR
         ───────────────────────────────────────────────────────────── */}
      {activeSubView === 'applications' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-0">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span>Pusat Kurasi Kemitraan Reseller</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold">
                  {filteredApplications.length} Permohonan
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Tinjau kreator yang mengajukan kurasi untuk menjual produk Anda. Saat disetujui, link referral unik langsung aktif.
              </p>
            </div>

            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-3 h-3" /> Zero Leakage
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                <ShieldCheck className="w-3 h-3" /> Strict Isolation
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Memuat permohonan kemitraan kurasi...
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-slate-700 font-bold text-sm">Tidak Ada Permohonan Kurasi</div>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                {applicationFilter !== 'ALL'
                  ? `Tidak ada permohonan dengan status '${applicationFilter}'.`
                  : 'Belum ada kreator yang mengajukan kemitraan untuk produk Anda saat ini.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-200 bg-slate-900/50">
                <thead className="bg-slate-900/60 border-b border-slate-800/60 text-slate-400 font-medium uppercase text-xs tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Kreator Pemohon</th>
                    <th className="py-3 px-4">Produk Diajukan</th>
                    <th className="py-3 px-4">Skema Komisi</th>
                    <th className="py-3 px-4 text-center">Status Kurasi</th>
                    <th className="py-3 px-4">Tanggal Pengajuan</th>
                    <th className="py-3 px-4 text-right">Keputusan Merchant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredApplications.map((app) => {
                    const isMutating = mutatingAppId === app.id;
                    const isPending = app.status === 'PENDING';
                    const isApproved = app.status === 'APPROVED';
                    const isRejected = app.status === 'REJECTED';
                    const isRevoked = app.status === 'REVOKED';

                    return (
                      <tr key={app.id} className="border-b border-slate-800/60 text-slate-200 text-sm hover:bg-slate-800/40 transition-colors">
                        {/* Kreator Pemohon */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {app.creator?.avatar_url ? (
                                <img
                                  src={app.creator.avatar_url}
                                  alt={app.creator.display_name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Users className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                <span>{app.creator?.display_name || app.creator_handle}</span>
                                <a
                                  href={`https://boontrack.com/@${app.creator_handle}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 hover:text-indigo-600 transition"
                                  title="Lihat Bio Link Kreator"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                @{app.creator_handle}
                              </div>
                              {app.creator?.whatsapp && (
                                <a
                                  href={`https://wa.me/${app.creator.whatsapp.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold hover:underline mt-0.5"
                                >
                                  <MessageCircle className="w-2.5 h-2.5" />
                                  <span>Chat WA</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Produk Diajukan */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5 max-w-xs">
                            {app.product?.image_url && (
                              <img
                                src={app.product.image_url}
                                alt={app.product.title}
                                className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {app.product?.title || 'Produk'}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Rp {Number(app.product?.price || 0).toLocaleString('id-ID')}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Skema Komisi */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-emerald-600">
                            {app.commission_type === 'PERCENTAGE'
                              ? `${app.commission_amount}% (est. Rp ${Number(app.estimated_commission_nominal || 0).toLocaleString('id-ID')})`
                              : `Rp ${Number(app.commission_amount || 0).toLocaleString('id-ID')}`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Per penjualan terverifikasi
                          </div>
                        </td>

                        {/* Status Kurasi */}
                        <td className="py-3.5 px-4 text-center">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 animate-pulse text-amber-600" />
                              <span>MENUNGGU PERSETUJUAN</span>
                            </span>
                          ) : isApproved ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>DISETUJUI (AKTIF)</span>
                            </span>
                          ) : isRejected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>DITOLAK TOKO</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span>DICABUT (REVOKED)</span>
                            </span>
                          )}
                        </td>

                        {/* Tanggal Pengajuan */}
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                          {new Date(app.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>

                        {/* Keputusan Merchant */}
                        <td className="py-3.5 px-4 text-right">
                          {isPending ? (
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={() => handleMutateApplication(app.id, 'APPROVED')}
                                disabled={isMutating}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                                title="Setujui permohonan kemitraan reseller kreator ini"
                              >
                                {isMutating ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3 h-3" />
                                )}
                                <span>Setujui (ACC)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleMutateApplication(app.id, 'REJECTED')}
                                disabled={isMutating}
                                className="px-2.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-[11px] inline-flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
                                title="Tolak permohonan kreator ini"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Tolak</span>
                              </button>
                            </div>
                          ) : isApproved ? (
                            <button
                              type="button"
                              onClick={() => handleMutateApplication(app.id, 'REVOKED')}
                              disabled={isMutating}
                              className="px-2.5 py-1 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 font-bold text-[10px] inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                              title="Cabut izin penjualan reseller untuk produk ini"
                            >
                              {isMutating ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                              <span>Cabut Izin</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium italic">
                              Tidak Ada Aksi
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          B. MODAL TAMBAH MITRA RESELLER BARU
         ───────────────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Tambah Mitra Reseller</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReseller} className="space-y-3.5 text-xs">
              {formError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                    <span className="font-semibold leading-relaxed">{formError}</span>
                  </div>
                  {upgradeUrlPrompt && (
                    <div className="pt-1">
                      <a
                        href={upgradeUrlPrompt}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xs transition"
                      >
                        <span>Upgrade Paket Reseller</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Nama Lengkap */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nama Mitra Reseller *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rina Anggraeni"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              {/* No WhatsApp */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nomor WhatsApp Aktif *</label>
                <input
                  type="tel"
                  required
                  placeholder="Contoh: 081234567890"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Kode Unik Rujukan */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Kode Unik Rujukan (Opsional)</label>
                  <span className="text-[10px] text-slate-400">Kosongkan untuk auto-generate</span>
                </div>
                <input
                  type="text"
                  placeholder="Contoh: RINA01 atau VIP10"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono uppercase"
                />
              </div>

              {/* Skema Komisi */}
              <div className="space-y-1.5 pt-1">
                <label className="font-semibold text-slate-700">Skema Komisi Reseller</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormCommissionType('PERCENTAGE')}
                    className={`py-2 px-3 rounded-xl border font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      formCommissionType === 'PERCENTAGE'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <BadgePercent className="w-3.5 h-3.5" />
                    <span>Persentase (%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormCommissionType('FIXED')}
                    className={`py-2 px-3 rounded-xl border font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      formCommissionType === 'FIXED'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Nominal Tetap (Rp)</span>
                  </button>
                </div>

                <div className="relative pt-1">
                  <input
                    type="number"
                    min="0"
                    step={formCommissionType === 'PERCENTAGE' ? '0.5' : '1000'}
                    value={formCommissionValue}
                    onChange={(e) => setFormCommissionValue(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono font-bold"
                  />
                  <span className="absolute right-3.5 top-3.5 text-slate-400 font-bold">
                    {formCommissionType === 'PERCENTAGE' ? '%' : 'IDR'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingNew ? 'Menyimpan...' : 'Simpan Mitra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
