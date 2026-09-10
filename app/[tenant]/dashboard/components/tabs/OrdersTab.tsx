'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, RefreshCw, Search, Filter } from 'lucide-react';
import GodPayButton, { OrderItem as GodPayOrderItem } from '../orders/GodPayButton';

export interface OrderItem {
  id: string;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  items_summary?: string;
  total_amount: number;
  payment_method?: string;
  payment_status: 'UNPAID' | 'PAID' | 'FAILED' | string;
  shipping_status?: string;
  created_at: string;
}

export interface OrdersTabProps {
  tenantSlug: string;
  orders?: OrderItem[];
  loading?: boolean;
  onRefresh?: () => void;
}

export default function OrdersTab({
  tenantSlug,
  orders: propOrders,
  loading: propLoading,
  onRefresh: propOnRefresh,
}: OrdersTabProps) {
  const [internalOrders, setInternalOrders] = useState<OrderItem[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const orders = propOrders ?? internalOrders;
  const loading = propLoading ?? internalLoading;

  const fetchOrders = useCallback(async () => {
    if (propOnRefresh) {
      propOnRefresh();
      return;
    }
    setInternalLoading(true);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders`);
      if (res.ok) {
        const data = await res.json();
        setInternalOrders(data.orders || []);
      }
    } catch (err) {
      console.warn('Gagal memuat daftar pesanan:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [tenantSlug, propOnRefresh]);

  useEffect(() => {
    if (!propOrders) {
      fetchOrders();
    }
  }, [fetchOrders, propOrders]);

  const handleOrderUpdated = (updatedOrder: OrderItem) => {
    setInternalOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
    );
  };

  const filteredOrders = orders.filter((o) => {
    const query = searchQuery.toLowerCase();
    const matchSearch =
      !searchQuery ||
      o.invoice_no?.toLowerCase().includes(query) ||
      o.customer_name?.toLowerCase().includes(query) ||
      o.customer_phone?.includes(searchQuery);
    const matchStatus = statusFilter === 'ALL' || o.payment_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      {/* Header Tab Pesanan Toko */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600" />
            <span>Daftar Pesanan Toko ({orders.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pantau seluruh transaksi checkout masuk, status pembayaran, dan verifikasi instan.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchOrders}
          disabled={loading}
          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Filter Bar & Tabel Pesanan */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari invoice, nama, WhatsApp..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Status</option>
              <option value="UNPAID">Belum Bayar (Unpaid)</option>
              <option value="PAID">Lunas (Paid)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3">Invoice</th>
                <th className="py-2.5 px-3">Pelanggan</th>
                <th className="py-2.5 px-3">Nominal</th>
                <th className="py-2.5 px-3">Metode</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Memuat transaksi pesanan...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                    Belum ada data pesanan yang cocok.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{ord.invoice_no}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{ord.customer_name || 'Pelanggan Toko'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{ord.customer_phone || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      Rp {ord.total_amount?.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 uppercase text-[11px] font-semibold text-slate-600">
                      {ord.payment_method || 'QRIS'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                          ord.payment_status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {ord.payment_status === 'PAID' ? 'PAID' : 'UNPAID'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <GodPayButton
                        order={ord as GodPayOrderItem}
                        tenantSlug={tenantSlug}
                        onSuccess={handleOrderUpdated}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
