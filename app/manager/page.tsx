'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  Search, 
  RotateCw, 
  Receipt,
  Wallet,
  PiggyBank,
  MessageCircle,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  CreditCard,
  Building2,
  X,
  FileCheck2,
  AlertCircle
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { 
  PartnerItem, 
  PayoutRequestItem, 
  INITIAL_PARTNERS, 
  INITIAL_PAYOUTS 
} from '@/lib/partner-service';

interface OrderRow {
  id: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  grossAmount: number;
  affiliateCode: string;
  affiliateCut: number;
  agencyCut: number;
  managerCut: number;
  status: string;
}

interface AffiliateSummary {
  code: string;
  name: string;
  totalOrders: number;
  grossSales: number;
  affiliatePayout: number;
  agencyPool: number;
  managerPayout: number;
}

export default function ManagerControlCenter() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'marketers' | 'partners' | 'payouts'>('orders');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateSummary[]>([]);

  // 1. Mitra Whitelist State
  const [partners, setPartners] = useState<PartnerItem[]>(INITIAL_PARTNERS);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);
  const [partnerErrorMsg, setPartnerErrorMsg] = useState('');
  const [partnerSuccessMsg, setPartnerSuccessMsg] = useState('');

  // Form New Partner
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'AM' | 'AFFILIATE'>('AFFILIATE');
  const [newRefCode, setNewRefCode] = useState('');
  const [newAmPembina, setNewAmPembina] = useState('Andi Pratama');

  // 2. Antrean Payout State
  const [payouts, setPayouts] = useState<PayoutRequestItem[]>(INITIAL_PAYOUTS);
  const [selectedPayout, setSelectedPayout] = useState<PayoutRequestItem | null>(null);
  const [proofUrl, setProofUrl] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [isSubmittingPaid, setIsSubmittingPaid] = useState(false);
  const [payoutSuccessMsg, setPayoutSuccessMsg] = useState('');
  const [payoutErrorMsg, setPayoutErrorMsg] = useState('');

  // Load Transactions from Supabase
  const loadLiveTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: commissions, error } = await supabase
        .from('affiliate_commissions')
        .select(`
          id,
          order_id,
          amount,
          status,
          created_at,
          tenant_id,
          affiliates:affiliate_id (
            name,
            referral_code
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (commissions && commissions.length > 0) {
        const mappedOrders: OrderRow[] = commissions.map((c: any) => {
          const gross = Number(c.amount) * 10;
          const affCode = c.affiliates?.referral_code || 'ANDI';
          const affName = c.affiliates?.name || 'Andi Pratama';

          return {
            id: c.order_id || `ORD-${c.id.slice(0, 8)}`,
            createdAt: new Date(c.created_at).toLocaleString('id-ID'),
            customerName: `Buyer (${c.tenant_id})`,
            customerPhone: '08123456789',
            productName: `Order Paket ${c.tenant_id}`,
            grossAmount: gross,
            affiliateCode: affCode,
            affiliateCut: Number(c.amount),
            agencyCut: gross * 0.25,
            managerCut: gross * 0.05,
            status: c.status || 'PAID'
          };
        });

        setOrders(mappedOrders);

        const affMap = new Map<string, AffiliateSummary>();
        mappedOrders.forEach((ord) => {
          const existing = affMap.get(ord.affiliateCode) || {
            code: ord.affiliateCode,
            name: ord.affiliateCode === 'ANDI' ? 'Andi Pratama' : 'Mitra Marketer',
            totalOrders: 0,
            grossSales: 0,
            affiliatePayout: 0,
            agencyPool: 0,
            managerPayout: 0,
          };

          existing.totalOrders += 1;
          existing.grossSales += ord.grossAmount;
          existing.affiliatePayout += ord.affiliateCut;
          existing.agencyPool += ord.agencyCut;
          existing.managerPayout += ord.managerCut;
          affMap.set(ord.affiliateCode, existing);
        });

        setAffiliates(Array.from(affMap.values()));
      } else {
        setOrders([]);
        setAffiliates([]);
      }
    } catch (err) {
      console.error('Gagal mengambil data manager:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Partners from API
  const loadPartners = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/manager/partners');
      const data = await res.json();
      if (data.success && data.partners) {
        setPartners(data.partners);
      }
    } catch (e) {
      console.warn('Fallback local partners:', e);
    }
  }, []);

  // Load Payouts from API
  const loadPayouts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/manager/payouts');
      const data = await res.json();
      if (data.success && data.payouts) {
        setPayouts(data.payouts);
      }
    } catch (e) {
      console.warn('Fallback local payouts:', e);
    }
  }, []);

  useEffect(() => {
    loadLiveTransactions();
    loadPartners();
    loadPayouts();
  }, [loadLiveTransactions, loadPartners, loadPayouts]);

  // Toggle Status Mitra (ACTIVE / SUSPENDED)
  const handleToggleStatus = async (partner: PartnerItem) => {
    const nextStatus = partner.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const actionLabel = nextStatus === 'ACTIVE' ? 'mengaktifkan kembali' : 'MENANGGUHKAN (suspend)';
    
    if (!window.confirm(`Apakah Anda yakin ingin ${actionLabel} akses mitra "${partner.name}" (${partner.referral_code})?`)) {
      return;
    }

    // Optimistic update
    setPartners((prev) =>
      prev.map((p) => (p.id === partner.id ? { ...p, status: nextStatus } : p))
    );

    try {
      const res = await fetch(`/api/v1/manager/partners/${encodeURIComponent(partner.id)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah status mitra');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status mitra';
      alert(msg);
      loadPartners();
    }
  };

  // Register New Partner Handler
  const handleRegisterPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) {
      setPartnerErrorMsg('Nama dan Nomor WhatsApp wajib diisi.');
      return;
    }

    setIsSubmittingPartner(true);
    setPartnerErrorMsg('');
    setPartnerSuccessMsg('');

    try {
      const res = await fetch('/api/v1/manager/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          phone: newPhone,
          email: newEmail,
          role: newRole,
          ref_code: newRefCode,
          am_pembina: newRole === 'AFFILIATE' ? newAmPembina : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal mendaftarkan mitra.');
      }

      setPartnerSuccessMsg(result.message || 'Mitra berhasil didaftarkan ke Whitelist!');
      if (result.partner) {
        setPartners((prev) => [result.partner, ...prev]);
      }

      setTimeout(() => {
        setIsRegisterModalOpen(false);
        setNewName('');
        setNewPhone('');
        setNewEmail('');
        setNewRefCode('');
        setPartnerSuccessMsg('');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setPartnerErrorMsg(msg);
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  // Mark Payout As Paid Handler
  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayout) return;
    if (!proofUrl) {
      setPayoutErrorMsg('URL bukti transfer bank wajib diisi.');
      return;
    }

    setIsSubmittingPaid(true);
    setPayoutErrorMsg('');
    setPayoutSuccessMsg('');

    try {
      const res = await fetch(`/api/v1/manager/payouts/${encodeURIComponent(selectedPayout.id)}/mark-paid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_url: proofUrl,
          notes: payoutNotes,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Gagal menandai lunas.');
      }

      setPayoutSuccessMsg(result.message || 'Payout berhasil ditandai LUNAS (PAID)!');

      // Update local state
      setPayouts((prev) =>
        prev.map((p) =>
          p.id === selectedPayout.id
            ? {
                ...p,
                status: 'PAID',
                proof_url: proofUrl,
                notes: payoutNotes,
                paid_at: new Date().toISOString(),
              }
            : p
        )
      );

      setTimeout(() => {
        setSelectedPayout(null);
        setProofUrl('');
        setPayoutNotes('');
        setPayoutSuccessMsg('');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setPayoutErrorMsg(msg);
    } finally {
      setIsSubmittingPaid(false);
    }
  };

  // Calculations
  const totalGross = affiliates.reduce((acc, curr) => acc + curr.grossSales, 0);
  const totalAgencyPool = affiliates.reduce((acc, curr) => acc + curr.agencyPool, 0);
  const totalManagerEarned = affiliates.reduce((acc, curr) => acc + curr.managerPayout, 0);
  const totalAffiliatePending = affiliates.reduce((acc, curr) => acc + curr.affiliatePayout, 0);

  // Available AM list for selection
  const amList = partners.filter((p) => p.role === 'AM');

  // Filtered lists
  const filteredOrders = orders.filter((o) =>
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.customerPhone.includes(searchTerm) ||
    o.affiliateCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAffiliates = affiliates.filter((a) =>
    a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPartners = partners.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone.includes(searchTerm) ||
    p.referral_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.am_pembina && p.am_pembina.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredPayouts = payouts.filter((p) =>
    p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.partner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.partner_phone.includes(searchTerm) ||
    p.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.account_number.includes(searchTerm) ||
    p.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-blue-500 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-2">
              Agency Control Plane &bull; Whitelist Engine
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Affiliate Manager Control Center
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Budget Promosi 30%, Payout Mitra, Manajemen Mitra Whitelist, dan Antrean Pencairan Dana.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center gap-2 text-xs font-bold transition shadow-lg shadow-blue-600/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Daftarkan Mitra Baru</span>
            </button>

            <button 
              onClick={() => alert(`Memproses payout saldo AM sebesar Rp ${totalManagerEarned.toLocaleString('id-ID')}`)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2 text-xs font-bold transition shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>Tarik Saldo AM (5%)</span>
            </button>

            <button 
              onClick={() => {
                loadLiveTransactions();
                loadPartners();
                loadPayouts();
              }}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 flex items-center gap-2 text-xs font-semibold transition cursor-pointer"
              title="Refresh All Data"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Total Gross Tim</span>
              <DollarSign className="w-4 h-4 text-slate-300" />
            </div>
            <div className="text-2xl font-black text-white">
              Rp {totalGross.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-indigo-900/40 rounded-2xl p-5 space-y-2 bg-gradient-to-b from-slate-900/90 to-indigo-950/20">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-indigo-400">Agensi Pool Promosi (25%)</span>
              <PiggyBank className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-indigo-400">
              Rp {totalAgencyPool.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-emerald-900/40 rounded-2xl p-5 space-y-2 bg-gradient-to-b from-slate-900/90 to-emerald-950/20">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-emerald-400">Saldo Payout AM (5%)</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">
              Rp {totalManagerEarned.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-amber-900/40 rounded-2xl p-5 space-y-2 bg-gradient-to-b from-slate-900/90 to-amber-950/20">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-amber-400">Antrean Payout Pending</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              {payouts.filter((p) => p.status === 'PENDING').length} Permohonan
            </div>
          </div>
        </div>

        {/* TAB & SEARCH BAR */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold gap-1">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'orders' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Data Transaksi ({orders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('marketers')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'marketers' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Alokasi Komisi</span>
            </button>
            <button
              onClick={() => setActiveTab('partners')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'partners' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Mitra Whitelist ({partners.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('payouts')}
              className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'payouts' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Antrean Payout ({payouts.filter((p) => p.status === 'PENDING').length} Pending)</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={
                activeTab === 'orders' ? 'Cari no invoice, nama, WA, ref...' :
                activeTab === 'marketers' ? 'Cari kode ref / nama marketer...' :
                activeTab === 'partners' ? 'Cari nama mitra, WA, ref, AM...' :
                'Cari nama, no rekening, status...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-base md:text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* TAB 1: DATA TRANSAKSI & DETAIL SPLIT */}
        {activeTab === 'orders' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Waktu</th>
                    <th className="px-6 py-3.5">Invoice</th>
                    <th className="px-6 py-3.5">Data Buyer (Direct WA)</th>
                    <th className="px-6 py-3.5">Gross Order</th>
                    <th className="px-6 py-3.5 text-amber-400">Komisi Affiliate</th>
                    <th className="px-6 py-3.5 text-indigo-400">Agensi Pool (25%)</th>
                    <th className="px-6 py-3.5 text-emerald-400">Hak AM (5%)</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        Belum ada data transaksi live dari database.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 font-mono text-slate-400 whitespace-nowrap">
                          {o.createdAt}
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-white whitespace-nowrap">
                          {o.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{o.customerName}</div>
                          <a
                            href={`https://wa.me/62${o.customerPhone.replace(/^0/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-mono font-medium border border-emerald-500/20"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>{o.customerPhone}</span>
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-200 line-clamp-1">{o.productName}</div>
                          <div className="font-bold text-white">Rp {o.grossAmount.toLocaleString('id-ID')}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-amber-400">Rp {o.affiliateCut.toLocaleString('id-ID')}</div>
                          <span className="text-[10px] text-slate-400 font-mono">Ref: {o.affiliateCode}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-indigo-400 whitespace-nowrap">
                          Rp {o.agencyCut.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400 whitespace-nowrap">
                          + Rp {o.managerCut.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PERFORMA & PAYOUT MARKETER */}
        {activeTab === 'marketers' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Kode Referral</th>
                    <th className="px-6 py-3.5">Nama Marketer</th>
                    <th className="px-6 py-3.5">Total Order</th>
                    <th className="px-6 py-3.5">Gross Penjualan</th>
                    <th className="px-6 py-3.5 text-amber-400">Komisi Affiliate</th>
                    <th className="px-6 py-3.5 text-indigo-400">Agensi Pool (25%)</th>
                    <th className="px-6 py-3.5 text-emerald-400">Payout AM (5%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAffiliates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        Belum ada marketer yang memiliki transaksi.
                      </td>
                    </tr>
                  ) : (
                    filteredAffiliates.map((a) => (
                      <tr key={a.code} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 font-mono font-bold text-blue-400">
                          {a.code}
                        </td>
                        <td className="px-6 py-4 text-white font-medium">
                          {a.name}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-200">
                          {a.totalOrders} order
                        </td>
                        <td className="px-6 py-4 font-bold text-white">
                          Rp {a.grossSales.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 font-bold text-amber-400">
                          Rp {a.affiliatePayout.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 font-bold text-indigo-400">
                          Rp {a.agencyPool.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400">
                          Rp {a.managerPayout.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: MITRA WHITELIST (FITUR 2.a) */}
        {activeTab === 'partners' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Daftar Mitra Whitelist Platform</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Hanya mitra terdaftar yang dapat login dan menerima komisi transaksi dari shop.boontrack.com.
                </p>
              </div>

              <button
                onClick={() => setIsRegisterModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md self-start sm:self-auto cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Daftarkan Mitra Baru</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3.5">Nama & Kontak</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Kode Referral</th>
                      <th className="px-6 py-3.5">AM Pembina</th>
                      <th className="px-6 py-3.5">Rekening Pencairan</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPartners.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                          Tidak ada mitra yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredPartners.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4">
                            <div className="font-bold text-white text-sm">{p.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <a
                                href={`https://wa.me/62${p.phone.replace(/^0/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-mono border border-emerald-500/20"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>{p.phone}</span>
                              </a>
                              {p.email && (
                                <span className="text-[11px] text-slate-400">{p.email}</span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {p.role === 'AM' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                AM (Account Manager)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                AFFILIATE
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-emerald-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                                {p.referral_code}
                              </span>
                              {p.is_ref_customized && (
                                <span className="text-[10px] text-amber-400 font-semibold" title="Kode kustom terkunci">
                                  🔒
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {p.role === 'AM' ? (
                              <span className="text-slate-500 italic text-[11px]">Head AM / Mandiri</span>
                            ) : (
                              <span className="font-medium text-slate-200 text-xs">
                                {p.am_pembina || 'Andi Pratama'}
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            {p.bank_name ? (
                              <div className="text-xs">
                                <span className="font-bold text-slate-200">{p.bank_name}</span> &bull; <span className="font-mono text-slate-400">{p.bank_account_number}</span>
                                <div className="text-[10px] text-slate-500">a.n {p.bank_account_holder}</div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">Belum disimpan</span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            {p.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>ACTIVE</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                <XCircle className="w-3 h-3" />
                                <span>SUSPENDED</span>
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(p)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                                p.status === 'ACTIVE'
                                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              {p.status === 'ACTIVE' ? 'Suspend' : 'Aktifkan'}
                            </button>
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

        {/* TAB 4: ANTREAN PAYOUT (FITUR 2.b) */}
        {activeTab === 'payouts' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>Antrean Penarikan Dana (Payout Mitra)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Daftar permintaan pencairan saldo komisi platform dari mitra AM dan Affiliate.
                </p>
              </div>

              <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 self-start sm:self-auto">
                Total Pending: <strong className="text-amber-400">{payouts.filter((p) => p.status === 'PENDING').length}</strong> permohonan
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3.5">ID Permohonan</th>
                      <th className="px-6 py-3.5">Nama Mitra & WhatsApp</th>
                      <th className="px-6 py-3.5">Nominal Penarikan</th>
                      <th className="px-6 py-3.5">Rekening Bank Tujuan</th>
                      <th className="px-6 py-3.5">Waktu Pengajuan</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPayouts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                          Tidak ada antrean penarikan dana saat ini.
                        </td>
                      </tr>
                    ) : (
                      filteredPayouts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4 font-mono font-bold text-slate-200 whitespace-nowrap">
                            {p.id}
                          </td>

                          <td className="px-6 py-4">
                            <div className="font-bold text-white">{p.partner_name}</div>
                            <a
                              href={`https://wa.me/62${p.partner_phone.replace(/^0/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-mono mt-0.5"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>{p.partner_phone}</span>
                            </a>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-base font-black text-emerald-400 whitespace-nowrap">
                              Rp {p.amount.toLocaleString('id-ID')}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-xs">
                              <span className="font-bold text-white">{p.bank_name}</span> &bull; <span className="font-mono text-slate-300">{p.account_number}</span>
                              <div className="text-[10px] text-slate-400 font-medium">a.n {p.account_holder}</div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                            {new Date(p.created_at).toLocaleString('id-ID')}
                          </td>

                          <td className="px-6 py-4">
                            {p.status === 'PAID' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>PAID (LUNAS)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                                <Clock className="w-3 h-3" />
                                <span>PENDING</span>
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {p.status === 'PENDING' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPayout(p);
                                  setProofUrl('');
                                  setPayoutNotes('');
                                  setPayoutErrorMsg('');
                                }}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md ml-auto cursor-pointer"
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                                <span>Mark as Paid</span>
                              </button>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                {p.proof_url ? (
                                  <a
                                    href={p.proof_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Bukti TF</span>
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-slate-500">Telah ditransfer</span>
                                )}
                              </div>
                            )}
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

      </div>

      {/* ── MODAL: DAFTARKAN MITRA BARU (FITUR 2.a) ── */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 relative">
            
            <button
              onClick={() => {
                setIsRegisterModalOpen(false);
                setPartnerErrorMsg('');
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-500/10 rounded-2xl text-blue-400 border border-blue-500/20">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Daftarkan Mitra Baru (Whitelist)</h3>
                <p className="text-xs text-slate-400">Tambah partner resmi promotor shop.boontrack.com</p>
              </div>
            </div>

            {partnerSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs space-y-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="font-bold text-sm">Mitra Berhasil Didaftarkan!</div>
                <p>{partnerSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleRegisterPartner} className="space-y-4">
                
                {partnerErrorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{partnerErrorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Nama Lengkap Mitra *
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Contoh: Rian Hidayat"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Nomor WhatsApp *
                    </label>
                    <input
                      type="text"
                      required
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Email (Opsional)
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="rian@example.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Role Mitra
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as 'AM' | 'AFFILIATE')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="AFFILIATE" className="bg-slate-900 text-white">Affiliate Promotor</option>
                      <option value="AM" className="bg-slate-900 text-white">Account Manager (AM)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Custom Ref Code (Opsional)
                    </label>
                    <input
                      type="text"
                      value={newRefCode}
                      onChange={(e) => setNewRefCode(e.target.value.toUpperCase())}
                      placeholder="RIAN88"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {newRole === 'AFFILIATE' && (
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Pilih AM Pembina
                      </label>
                      <select
                        value={newAmPembina}
                        onChange={(e) => setNewAmPembina(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {amList.length > 0 ? (
                          amList.map((am) => (
                            <option key={am.id} value={am.name} className="bg-slate-900 text-white">
                              {am.name} ({am.referral_code})
                            </option>
                          ))
                        ) : (
                          <option value="Andi Pratama" className="bg-slate-900 text-white">
                            Andi Pratama (AM Utama)
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                  Setelah didaftarkan, mitra dapat langsung login via WhatsApp OTP di <span className="text-blue-400 font-mono">/affiliate/login</span>.
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPartner}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmittingPartner ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Simpan ke Whitelist</span>
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

      {/* ── MODAL: MARK AS PAID (FITUR 2.b) ── */}
      {selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 relative">
            
            <button
              onClick={() => {
                setSelectedPayout(null);
                setPayoutErrorMsg('');
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Konfirmasi Transfer (Mark as Paid)</h3>
                <p className="text-xs text-slate-400">Verifikasi dan lampirkan bukti pembayaran permohonan payout</p>
              </div>
            </div>

            {payoutSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs space-y-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="font-bold text-sm">Payout Berhasil Ditandai Lunas!</div>
                <p>{payoutSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleMarkAsPaid} className="space-y-4">
                
                {/* Rincian Permohonan */}
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Mitra:</span>
                    <span className="font-bold text-white">{selectedPayout.partner_name}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Nominal:</span>
                    <span className="font-black text-emerald-400 text-sm">
                      Rp {selectedPayout.amount.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Rekening Tujuan:</span>
                    <span className="font-mono text-slate-200">
                      {selectedPayout.bank_name} - {selectedPayout.account_number}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Atas Nama:</span>
                    <span className="font-medium text-slate-200">{selectedPayout.account_holder}</span>
                  </div>
                </div>

                {payoutErrorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{payoutErrorMsg}</span>
                  </div>
                )}

                {/* Input URL Bukti Transfer */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    URL Bukti Transfer Bank (Screenshot/PDF Receipt) *
                  </label>
                  <input
                    type="url"
                    required
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://images.example.com/transfer-receipt-01.jpg"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Contoh: tautan gambar slip transfer m-banking / bukti settlement.
                  </span>
                </div>

                {/* Catatan Transfer */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Catatan / Nomor Referensi Bank
                  </label>
                  <input
                    type="text"
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    placeholder="Contoh: Transfer via BCA Bisnis Batch #9021"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPayout(null)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPaid || !proofUrl}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {isSubmittingPaid ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Simpan & Tandai Lunas</span>
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
}