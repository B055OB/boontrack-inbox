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
  CheckCircle
} from 'lucide-react';
import ResellerComplianceModal from '../ResellerComplianceModal';

interface ResellerMember {
  id: string;
  code: string;
  name: string;
  phone: string;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
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
  const [activeSubView, setActiveSubView] = useState<'members' | 'commissions'>('members');
  const [resellers, setResellers] = useState<ResellerMember[]>([]);
  const [commissions, setCommissions] = useState<ResellerCommissionRecord[]>([]);
  const [metrics, setMetrics] = useState({
    active_resellers: 0,
    total_orders: 0,
    total_gmv: 0,
    total_outstanding_commission: 0,
    total_paid_commission: 0,
  });

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
      const [membersRes, commsRes] = await Promise.all([
        fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/members`),
        fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/reseller/commissions`),
      ]);

      if (membersRes.ok) {
        const mData = await membersRes.json();
        if (mData.success && Array.isArray(mData.resellers)) {
          setResellers(mData.resellers);
        }
      }

      if (commsRes.ok) {
        const cData = await commsRes.json();
        if (cData.success && Array.isArray(cData.commissions)) {
          setCommissions(cData.commissions);
          if (cData.metrics) {
            setMetrics(cData.metrics);
          }
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
        await loadData(true);
      } else {
        setFormError(data.error || 'Gagal menambahkan reseller baru.');
      }
    } catch (err: any) {
      setFormError('Terjadi kesalahan jaringan.');
    } finally {
      setIsSubmittingNew(false);
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

  // Filtered lists
  const filteredResellers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return resellers;
    return resellers.filter(r => 
      r.name.toLowerCase().includes(q) || 
      r.code.toLowerCase().includes(q) || 
      r.phone.includes(q)
    );
  }, [resellers, searchQuery]);

  const filteredCommissions = useMemo(() => {
    return commissions.filter(c => {
      if (commissionFilter === 'PENDING' && c.status === 'PAID') return false;
      if (commissionFilter === 'PAID' && c.status !== 'PAID') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const rName = c.store_resellers?.name?.toLowerCase() || '';
        const rCode = c.store_resellers?.code?.toLowerCase() || '';
        const oId = c.orders?.order_number?.toLowerCase() || c.order_id.toLowerCase();
        return rName.includes(q) || rCode.includes(q) || oId.includes(q);
      }
      return true;
    });
  }, [commissions, commissionFilter, searchQuery]);

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
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {metrics.active_resellers} <span className="text-xs font-normal text-slate-400">mitra</span>
          </div>
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
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveSubView('members')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
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
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubView === 'commissions'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Buku Besar Komisi / Ledger ({commissions.length})</span>
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

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, kode, atau order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs w-52 focus:outline-none focus:border-indigo-500 bg-white"
            />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          C. TABEL DAFTAR RESELLER
         ───────────────────────────────────────────────────────────── */}
      {activeSubView === 'members' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
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
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
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
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredResellers.map((reseller) => {
                    const isCopied = copiedCode === reseller.code;
                    return (
                      <tr key={reseller.id} className="hover:bg-slate-50/60 transition">
                        {/* Nama & Kontak */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{reseller.name}</div>
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
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            reseller.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            {reseller.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>

                        {/* Aksi Cepat */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Salin Link */}
                            <button
                              type="button"
                              onClick={() => handleCopyLink(reseller.code)}
                              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                                isCopied
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                              title="Salin Link Jualan Toko"
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
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">No Order &amp; Waktu</th>
                    <th className="py-3 px-4">Mitra Reseller</th>
                    <th className="py-3 px-4">Nilai Order (Base)</th>
                    <th className="py-3 px-4">Hak Komisi</th>
                    <th className="py-3 px-4 text-center">Status Settlement</th>
                    <th className="py-3 px-4 text-right">Aksi Merchant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredCommissions.map((comm) => {
                    const isSettling = settlingId === comm.id;
                    const isPaid = comm.status === 'PAID';

                    return (
                      <tr key={comm.id} className="hover:bg-slate-50/60 transition">
                        {/* No Order & Waktu */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900">
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
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
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
