'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  QrCode,
  DollarSign,
  MessageSquare,
  X,
  CreditCard,
} from 'lucide-react';
import { GymInvoice, getGymInvoices, payGymInvoice } from '@/lib/gym-api';

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PAID: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  UNPAID: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  OVERDUE: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30' },
};

export default function GymInvoicesPage() {
  const [invoices, setInvoices] = useState<GymInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Pay Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<GymInvoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'QRIS' | 'CASH' | 'TRANSFER'>('QRIS');
  const [paying, setPaying] = useState(false);

  const loadInvoices = useCallback(async () => {
    try {
      const data = await getGymInvoices(
        {
          status: statusFilter,
          search: searchQuery,
        },
        'atmosfitnes'
      );
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const data = await getGymInvoices(
          {
            status: statusFilter,
            search: searchQuery,
          },
          'atmosfitnes'
        );
        if (isMounted) {
          setInvoices(data);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchInitial();
    return () => {
      isMounted = false;
    };
  }, [statusFilter, searchQuery]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadInvoices();
  };

  const handleOpenPayModal = (inv: GymInvoice) => {
    setSelectedInvoice(inv);
    setPayModalOpen(true);
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setPaying(true);
    const res = await payGymInvoice(selectedInvoice.id, paymentMethod, 'atmosfitnes');
    setPaying(false);

    if (res.success) {
      setPayModalOpen(false);
      loadInvoices();
    }
  };

  const totalUnpaid = invoices.filter((i) => i.status === 'UNPAID').reduce((acc, i) => acc + i.total_amount, 0);
  const totalPaid = invoices.filter((i) => i.status === 'PAID').reduce((acc, i) => acc + i.total_amount, 0);
  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Tagihan & Invoice Member
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              Billing Hub
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pantau pembayaran membership bulanan, sesi Zumba, dan kirim pengingat tagihan via WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Total Tagihan Lunas</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              Rp {totalPaid.toLocaleString('id-ID')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Belum Bayar (Pending)</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              Rp {totalUnpaid.toLocaleString('id-ID')}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Tagihan Jatuh Tempo</p>
            <p className="text-2xl font-bold text-rose-400 mt-1">{overdueCount} Invoice</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor invoice / nama member..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'ALL', label: 'Semua' },
            { id: 'UNPAID', label: 'Belum Bayar' },
            { id: 'PAID', label: 'Lunas' },
            { id: 'OVERDUE', label: 'Jatuh Tempo' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">No. Invoice</th>
                <th className="py-3.5 px-4">Member</th>
                <th className="py-3.5 px-4">Deskripsi Tagihan</th>
                <th className="py-3.5 px-4">Total (Rp)</th>
                <th className="py-3.5 px-4">Jatuh Tempo</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-4">
                      <div className="h-4 bg-slate-800 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                    Tidak ada tagihan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const badge = STATUS_BADGES[inv.status] || STATUS_BADGES.UNPAID;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-200">
                        {inv.invoice_no}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-white text-xs">{inv.member_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-mono">{inv.whatsapp}</span>
                          <a
                            href={`https://wa.me/${inv.whatsapp}?text=Halo%20${encodeURIComponent(inv.member_name)},%20ini%20pengingat%20tagihan%20gym%20Atmosfitnes%20sebesar%20Rp%20${inv.total_amount.toLocaleString('id-ID')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline text-[10px] flex items-center gap-0.5"
                          >
                            <MessageSquare className="w-2.5 h-2.5" />
                            WA
                          </a>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{inv.description}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        Rp {inv.total_amount.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(inv.due_date).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {inv.status !== 'PAID' ? (
                          <button
                            onClick={() => handleOpenPayModal(inv)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-sm cursor-pointer"
                          >
                            Bayar Kasir
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 flex items-center justify-end gap-1 font-mono">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {inv.payment_method || 'LUNAS'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: PAY INVOICE */}
      {payModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setPayModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Proses Pembayaran Tagihan</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedInvoice.invoice_no}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 mb-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Nama Member:</span>
                <span className="font-bold text-white">{selectedInvoice.member_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Deskripsi:</span>
                <span className="text-slate-300">{selectedInvoice.description}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800 text-sm">
                <span className="font-semibold text-white">Total Tagihan:</span>
                <span className="font-mono font-extrabold text-emerald-400">
                  Rp {selectedInvoice.total_amount.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <form onSubmit={handleProcessPayment} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Pilih Metode Pembayaran
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'QRIS' as const, label: 'QRIS Dynamic', icon: QrCode },
                    { id: 'CASH' as const, label: 'Tunai Kasir', icon: DollarSign },
                    { id: 'TRANSFER' as const, label: 'Transfer Bank', icon: CreditCard },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-xs font-medium cursor-pointer ${
                          paymentMethod === m.id
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950 transition cursor-pointer"
                >
                  {paying ? 'Memproses...' : 'Konfirmasi Lunas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
