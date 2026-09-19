import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingBag, 
  RefreshCw, 
  Search, 
  Filter, 
  Eye, 
  X, 
  ExternalLink, 
  Package, 
  FileText, 
  Sparkles, 
  Key, 
  Download, 
  Truck, 
  CheckCircle2, 
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Check,
} from 'lucide-react';
import GodPayButton, { OrderItem as GodPayOrderItem } from '../orders/GodPayButton';
import { 
  resolveFulfillmentRequirements, 
  ProductType, 
  FulfillmentMetadata 
} from '@/lib/product-catalog';
import { getSupabase } from '@/lib/supabaseClient';


export interface OrderItem {
  id: string;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items_summary?: string;
  total_amount: number;
  payment_method?: string;
  payment_status: 'UNPAID' | 'PAID' | 'FAILED' | 'PENDING' | 'WAITING_PAYMENT' | string;
  status?: string;
  shipping_status?: string;
  product_type?: ProductType;
  shipping_address?: string;
  shipping_courier?: string;
  tracking_number?: string;
  waybill?: string;
  fulfillment_metadata?: FulfillmentMetadata;
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

  const orders: OrderItem[] = React.useMemo(() => {
    const raw = (propOrders && propOrders.length > 0) ? propOrders : internalOrders;
    return raw.map((o: any) => ({
      id: String(o.id || o.invoice_no),
      invoice_no: o.invoice_no || String(o.id || '').slice(0, 10),
      customer_name: o.customer_name || 'Pelanggan Toko',
      customer_phone: o.customer_phone || '',
      customer_email: o.customer_email || '',
      items_summary: o.items_summary || o.product_title || o.product_name || '',
      total_amount: Number(o.total_amount ?? o.gross_amount ?? o.total_price ?? 0),
      payment_method: o.payment_method || 'QRIS / TRANSFER',
      payment_status: (o.payment_status || o.status || 'PENDING').toUpperCase(),
      status: (o.status || o.payment_status || 'PENDING').toUpperCase(),
      shipping_status: o.shipping_status,
      product_type: o.product_type,
      shipping_address: o.shipping_address,
      shipping_courier: o.shipping_courier,
      tracking_number: o.tracking_number,
      waybill: o.waybill,
      fulfillment_metadata: o.fulfillment_metadata,
      created_at: o.created_at || new Date().toISOString(),
    }));
  }, [propOrders, internalOrders]);

  const loading = (propOrders && propOrders.length > 0) ? false : (propLoading ?? internalLoading);

  // State untuk dialog konfirmasi pembayaran manual
  const [orderToConfirm, setOrderToConfirm] = useState<OrderItem | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  // State floating toast notifikasi
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchOrders = useCallback(async () => {
    if (propOnRefresh) {
      propOnRefresh();
      return;
    }
    setInternalLoading(true);
    try {
      const res = await fetch(`/api/orders?tenant=${encodeURIComponent(tenantSlug)}&limit=3500`);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.orders || data.data || []);
        const mappedList: OrderItem[] = rawList.map((o: any) => ({
          id: String(o.id || o.invoice_no),
          invoice_no: o.invoice_no || String(o.id || '').slice(0, 10),
          customer_name: o.customer_name || 'Pelanggan Toko',
          customer_phone: o.customer_phone || '',
          customer_email: o.customer_email || '',
          items_summary: o.items_summary || o.product_title || o.product_name || '',
          total_amount: Number(o.total_amount ?? o.gross_amount ?? o.total_price ?? 0),
          payment_method: o.payment_method || 'QRIS / TRANSFER',
          payment_status: (o.payment_status || o.status || 'PENDING').toUpperCase(),
          status: (o.status || o.payment_status || 'PENDING').toUpperCase(),
          shipping_status: o.shipping_status,
          product_type: o.product_type,
          shipping_address: o.shipping_address,
          shipping_courier: o.shipping_courier,
          tracking_number: o.tracking_number,
          waybill: o.waybill,
          fulfillment_metadata: o.fulfillment_metadata,
          created_at: o.created_at || new Date().toISOString(),
        }));
        setInternalOrders(mappedList);
      }
    } catch (err) {
      console.warn('Gagal memuat daftar pesanan:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [tenantSlug, propOnRefresh]);

  useEffect(() => {
    if (!propOrders || propOrders.length === 0) {
      fetchOrders();
    }
  }, [fetchOrders, propOrders]);

  const handleOrderUpdated = (updatedOrder: OrderItem) => {
    setInternalOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
    );
  };

  // Helper identifikasi pesanan manual yang berstatus pending/waiting_payment
  const isManualPendingPayment = (order: OrderItem) => {
    const paymentStatus = String(order.payment_status || order.status || '').toUpperCase();
    const isPending = ['PENDING', 'WAITING_PAYMENT', 'UNPAID', 'WAITING'].includes(paymentStatus);
    
    const method = String(order.payment_method || '').toUpperCase();
    const isManual = 
      !method ||
      method.includes('TRANSFER') ||
      method.includes('REKENING') ||
      method.includes('BANK') ||
      method.includes('QRIS') ||
      method.includes('MANUAL') ||
      method.includes('BCA') ||
      method.includes('MANDIRI') ||
      method.includes('BRI') ||
      method.includes('BNI') ||
      method.includes('CASH');

    return isPending && isManual;
  };

  const filteredOrders = orders.filter((o) => {
    const query = searchQuery.toLowerCase();
    const matchSearch =
      !searchQuery ||
      o.invoice_no?.toLowerCase().includes(query) ||
      o.customer_name?.toLowerCase().includes(query) ||
      o.customer_phone?.includes(searchQuery);
    
    const pStatus = (o.payment_status || o.status || '').toUpperCase();
    const matchStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'PAID' && (pStatus === 'PAID' || pStatus === 'LUNAS')) ||
      (statusFilter === 'UNPAID' && (pStatus === 'UNPAID' || pStatus === 'PENDING' || pStatus === 'WAITING_PAYMENT'));

    return matchSearch && matchStatus;
  });

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Aksi Konfirmasi Bayar Manual (Tandai Lunas)
  const handleConfirmManualPayment = async (order: OrderItem) => {
    setIsConfirmingPayment(true);
    try {
      // 1. Optimistic update ke state lokal tabel
      const updatedOrder: OrderItem = {
        ...order,
        payment_status: 'PAID',
        status: 'PAID',
      };

      setInternalOrders((prev) =>
        prev.map((o) => (o.id === order.id ? updatedOrder : o))
      );

      if (selectedOrder?.id === order.id) {
        setSelectedOrder((prev) => (prev ? { ...prev, payment_status: 'PAID', status: 'PAID' } : null));
      }

      // 2. Request ke Next.js Quick-Paid API (memproses fulfillment & notifikasi WhatsApp)
      try {
        await fetch(
          `/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${encodeURIComponent(order.id)}/quick-paid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } catch (e) {
        console.warn('[OrdersTab] quick-paid endpoint note:', e);
      }

      // 3. Request ke Core Backend status update endpoint (memicu event Purchase Meta CAPI)
      try {
        await fetch(`https://api.boontrack.com/api/v1/orders/${encodeURIComponent(order.id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'LUNAS',
            notes: 'Konfirmasi manual oleh admin toko',
          }),
        });
      } catch {}

      // 4. Update langsung ke database Supabase
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase
            .from('orders')
            .update({
              status: 'PAID',
              payment_status: 'PAID',
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);
        } catch (sbErr) {
          console.warn('[OrdersTab] Supabase update note:', sbErr);
        }
      }

      // 5. Tampilkan toast notifikasi sukses
      setToast({
        message: `Pesanan #${order.invoice_no || order.id.slice(0, 8)} berhasil dikonfirmasi LUNAS!`,
        type: 'success',
      });
      setTimeout(() => {
        setToast((prev) => (prev?.message.includes(order.invoice_no || '') ? null : prev));
      }, 4000);

      setOrderToConfirm(null);
    } catch (err: unknown) {
      console.error('[OrdersTab] Failed to confirm payment:', err);
      setToast({
        message: 'Gagal mengonfirmasi pembayaran. Silakan coba lagi.',
        type: 'error',
      });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const togglePaymentStatus = async (order: OrderItem) => {
    const currentIsPaid = order.payment_status === 'PAID' || order.status === 'PAID';
    const newStatus = currentIsPaid ? 'UNPAID' : 'PAID';
    setTogglingId(order.id);
    try {
      // 1. Optimistic update
      const applyUpdate = (prev: OrderItem[]) =>
        prev.map((o) => (o.id === order.id ? { ...o, payment_status: newStatus, status: newStatus } : o));
      setInternalOrders((prev) => applyUpdate(prev));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder((prev) => prev ? { ...prev, payment_status: newStatus, status: newStatus } : null);
      }

      // 2. Persist ke Supabase
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('orders').update({ payment_status: newStatus, status: newStatus }).eq('id', order.id);
      } else {
        // fallback: hit API
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_status: newStatus, status: newStatus }),
        });
      }

      setToast({
        message: `Status pesanan #${order.invoice_no} diubah menjadi ${newStatus}.`,
        type: 'success',
      });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.warn('[OrdersTab] Error toggling payment_status:', err);
      await fetchOrders();
    } finally {
      setTogglingId(null);
    }
  };

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
            Pantau seluruh transaksi checkout masuk, verifikasi konfirmasi pembayaran manual, dan pemenuhan pesanan instan.
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
              <option value="UNPAID">Menunggu Pembayaran / Belum Lunas</option>
              <option value="PAID">Lunas (Paid / Verified)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3">Invoice</th>
                <th className="py-2.5 px-3">Pelanggan</th>
                <th className="py-2.5 px-3">Tipe / Pemenuhan</th>
                <th className="py-2.5 px-3">Nominal</th>
                <th className="py-2.5 px-3">Metode</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Memuat transaksi pesanan...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                    Belum ada data pesanan yang cocok.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => {
                  const reqs = resolveFulfillmentRequirements(
                    ord.product_type || (ord.shipping_address ? 'PHYSICAL' : 'DIGITAL')
                  );
                  const isPaid = ord.payment_status === 'PAID' || ord.status === 'PAID';
                  const needsManualConfirm = isManualPendingPayment(ord);

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(ord)}
                          className="hover:text-blue-600 hover:underline cursor-pointer text-left"
                        >
                          {ord.invoice_no}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{ord.customer_name || 'Pelanggan Toko'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{ord.customer_phone || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {reqs.requiresShipping ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            <Truck className="w-3 h-3 text-amber-600" />
                            <span>{ord.shipping_courier || 'Ekspedisi'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            <Sparkles className="w-3 h-3 text-blue-600" />
                            <span>Digital / Direct</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 font-mono">
                        Rp {ord.total_amount?.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[11px] font-semibold text-slate-600">
                        {ord.payment_method || 'QRIS / TRANSFER'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {isPaid ? 'PAID (LUNAS)' : 'PENDING'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* TOMBOL AKSI MANUAL: KONFIRMASI BAYAR / TANDAI LUNAS */}
                          {needsManualConfirm && (
                            <button
                              type="button"
                              onClick={() => setOrderToConfirm(ord)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs hover:shadow transition-all active:scale-95 cursor-pointer shrink-0"
                              title="Konfirmasi Pembayaran Manual / Tandai Lunas"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Konfirmasi Bayar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Lihat Rincian Pesanan"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Paid / Unpaid inline */}
                          <button
                            type="button"
                            title={isPaid ? 'Tandai Unpaid' : 'Tandai Paid'}
                            disabled={togglingId === ord.id}
                            onClick={() => togglePaymentStatus(ord)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[10px] border transition cursor-pointer disabled:opacity-50 ${
                              isPaid
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                            }`}
                          >
                            {togglingId === ord.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isPaid ? (
                              <><ToggleRight className="w-3.5 h-3.5" /><span>PAID</span></>
                            ) : (
                              <><ToggleLeft className="w-3.5 h-3.5" /><span>UNPAID</span></>
                            )}
                          </button>

                          <GodPayButton
                            order={ord as GodPayOrderItem}
                            tenantSlug={tenantSlug}
                            onSuccess={handleOrderUpdated}
                          />
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

      {/* ======================================================== */}
      {/* MODAL DETAIL PESANAN & FULFILLMENT BOUNDARY              */}
      {/* ======================================================== */}
      {selectedOrder && (() => {
        const orderReqs = resolveFulfillmentRequirements(
          selectedOrder.product_type || (selectedOrder.shipping_address ? 'PHYSICAL' : 'DIGITAL')
        );
        const meta = selectedOrder.fulfillment_metadata;
        const isOrderPaid = selectedOrder.payment_status === 'PAID' || selectedOrder.status === 'PAID';
        const needsManualConfirm = isManualPendingPayment(selectedOrder);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Rincian Pesanan: {selectedOrder.invoice_no}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">ID: {selectedOrder.id}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {/* 1. Status & Finansial */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Status Pembayaran:</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${
                        isOrderPaid
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {isOrderPaid ? 'LUNAS (PAID)' : 'BELUM LUNAS (PENDING)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Metode Pembayaran:</span>
                    <span className="font-bold text-slate-800 uppercase font-mono">
                      {selectedOrder.payment_method || 'QRIS / TRANSFER'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                    <span className="font-bold text-slate-700">Total Nominal:</span>
                    <span className="text-sm font-black text-emerald-600 font-mono">
                      Rp {selectedOrder.total_amount?.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* 2. Informasi Pelanggan */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    <span>Data Pelanggan</span>
                  </h4>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nama:</span>
                      <span className="font-bold text-slate-800">{selectedOrder.customer_name || 'Pelanggan Toko'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">WhatsApp:</span>
                      <a
                        href={`https://wa.me/${(selectedOrder.customer_phone || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-bold text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <span>{selectedOrder.customer_phone || '-'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {selectedOrder.customer_email && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Email:</span>
                        <span className="font-mono text-slate-700">{selectedOrder.customer_email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Fulfillment Strategy Boundary Section (Deterministik: Fisik vs Non-Fisik) */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    {orderReqs.requiresShipping ? (
                      <>
                        <Truck className="w-3.5 h-3.5 text-amber-600" />
                        <span>Logistik &amp; Ekspedisi Pengiriman Fisik</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Pengiriman Non-Fisik &amp; Akses Langsung</span>
                      </>
                    )}
                  </h4>

                  {orderReqs.requiresShipping ? (
                    <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Layanan Ekspedisi:</span>
                        <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                          {selectedOrder.shipping_courier || 'Ekspedisi Reguler'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-1 border-t border-amber-200/60">
                        <span className="text-slate-500 text-[10px] font-semibold">Alamat Tujuan:</span>
                        <p className="text-slate-800 leading-snug font-medium">
                          {selectedOrder.shipping_address || 'Belum mencantumkan alamat lengkap'}
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-amber-200/60">
                        <span className="text-slate-600 font-medium">Nomor Resi:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {selectedOrder.tracking_number || selectedOrder.waybill || 'Menunggu Resi'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Strategi Fulfillment:</span>
                        <span className="font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded text-[10px]">
                          Bebas Pengiriman Fisik &amp; Tanpa Resi Kurir
                        </span>
                      </div>

                      <div className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Tipe Akses:</span>
                          <span className="font-bold text-slate-800">
                            {meta?.delivery_type === 'DOWNLOAD_LINK'
                              ? 'Link Unduh Materi'
                              : meta?.delivery_type === 'LICENSE_KEY'
                              ? 'Kunci Lisensi'
                              : 'Formulir / Akses Langsung'}
                          </span>
                        </div>

                        {meta?.license_key && (
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-400 block">Kunci Lisensi Pembeli:</span>
                            <div className="font-mono font-bold text-blue-700 select-all">{meta.license_key}</div>
                          </div>
                        )}

                        {meta?.instructions && (
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-400 block">Petunjuk:</span>
                            <p className="text-[11px] text-slate-600 whitespace-pre-line">{meta.instructions}</p>
                          </div>
                        )}

                        {meta?.access_url && (
                          <a
                            href={meta.access_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-1"
                          >
                            <span>Buka URL Akses Materi</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Tutup
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* TOMBOL KONFIRMASI BAYAR MANUAL DARI MODAL DETAIL */}
                  {needsManualConfirm && (
                    <button
                      type="button"
                      onClick={() => setOrderToConfirm(selectedOrder)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Konfirmasi Bayar Manual</span>
                    </button>
                  )}

                  {/* Toggle Paid/Unpaid dari modal */}
                  <button
                    type="button"
                    disabled={togglingId === selectedOrder.id}
                    onClick={() => togglePaymentStatus(selectedOrder)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs border transition cursor-pointer disabled:opacity-50 ${
                      isOrderPaid
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                    }`}
                  >
                    {togglingId === selectedOrder.id ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Menyimpan...</span></>
                    ) : isOrderPaid ? (
                      <><ToggleRight className="w-3.5 h-3.5" /><span>Tandai Unpaid</span></>
                    ) : (
                      <><ToggleLeft className="w-3.5 h-3.5" /><span>Tandai Paid ✓</span></>
                    )}
                  </button>

                  <GodPayButton
                    order={selectedOrder as GodPayOrderItem}
                    tenantSlug={tenantSlug}
                    onSuccess={(upd) => {
                      handleOrderUpdated(upd);
                      setSelectedOrder((prev) => (prev ? { ...prev, ...upd } : null));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* MODAL DIALOG KONFIRMASI PEMBAYARAN MANUAL                */}
      {/* ======================================================== */}
      {orderToConfirm && (
        <div className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Konfirmasi Pembayaran Manual</h3>
                  <p className="text-[11px] text-slate-500">Verifikasi penerimaan dana masuk</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={() => setOrderToConfirm(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice:</span>
                  <span className="font-mono font-bold text-slate-800">{orderToConfirm.invoice_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pelanggan:</span>
                  <span className="font-bold text-slate-800">{orderToConfirm.customer_name || 'Pelanggan Toko'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">WhatsApp:</span>
                  <span className="font-mono text-slate-700">{orderToConfirm.customer_phone || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Metode Bayar:</span>
                  <span className="font-semibold text-slate-800 uppercase">{orderToConfirm.payment_method || 'Transfer Rekening / QRIS Manual'}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-2">
                  <span className="font-bold text-slate-700">Total Tagihan:</span>
                  <span className="text-base font-black text-emerald-600 font-mono">
                    Rp {orderToConfirm.total_amount?.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Pastikan mutasi dana telah <strong>masuk ke rekening bank atau QRIS</strong> Anda. Menandai lunas akan memicu pembukaan akses materi/fulfillment dan notifikasi WhatsApp resmi kepada pembeli.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={() => setOrderToConfirm(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={() => handleConfirmManualPayment(orderToConfirm)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isConfirmingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Ya, Tandai Lunas</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* FLOATING TOAST NOTIFICATION                              */}
      {/* ======================================================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[130] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/25'
                : 'bg-rose-600 text-white border-rose-500 shadow-rose-600/25'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 rounded-full hover:bg-white/20 transition cursor-pointer ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
