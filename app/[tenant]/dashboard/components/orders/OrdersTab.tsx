'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingBag, RefreshCw, Layers, Search, Filter } from 'lucide-react';
import GodPayButton from './GodPayButton';

interface OrderItem {
  id: string;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  items_summary?: string;
  total_amount: number;
  payment_method?: string;
  payment_status: 'UNPAID' | 'PAID' | 'FAILED';
  shipping_status?: string;
  created_at: string;
}

export default function OrdersTab({ tenantSlug }: { tenantSlug: string }) {
  const [subTab, setSubTab] = useState<'direct' | 'melangkah'>('direct');
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch {
      console.warn('Gagal memuat daftar order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [tenantSlug]);

  const handleOrderUpdated = (updatedOrder: OrderItem) => {
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o)));
  };

  const filteredOrders = orders.filter((o) => {
    const matchSearch =
      o.invoice_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_phone?.includes(searchQuery);
    const matchStatus = statusFilter === 'ALL' || o.payment_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      return (
    <div className="space-y-4">
      {/* Header Tab Pesanan Toko */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Daftar Pesanan Toko
          </span>
        </div>

        <button
          type="button"
          onClick={fetchOrders}
          className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 flex items-center gap-1 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Filter Bar & Tabel Pesanan langsung di bawahnya */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Konten tabel / list pesanan */}
      </div>
    </div>
  );
          
        /* Direct Store Orders Table */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari invoice, nama, WhatsApp..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold focus:outline-none"
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
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
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
                        <GodPayButton order={ord} tenantSlug={tenantSlug} onSuccess={handleOrderUpdated} />
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