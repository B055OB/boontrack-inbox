import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingBag, 
  RefreshCw, 
  Search, 
  Filter, 
  Eye, 
  EyeOff,
  Archive,
  ArchiveRestore,
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
  Printer,
} from 'lucide-react';
import DateRangePicker, { DateRangeState, getDateRangeFromPreset } from '../DateRangePicker';
import GodPayButton, { OrderItem as GodPayOrderItem } from '../orders/GodPayButton';
import { 
  resolveFulfillmentRequirements, 
  ProductType, 
  FulfillmentMetadata,
  normalizeBriefingUrl
} from '@/lib/product-catalog';
import { getSupabase } from '@/lib/supabaseClient';
import {
  printThermalShippingLabel,
  printOrderInvoice,
  exportOrdersToLincahCsv,
} from '@/lib/utils/orderFulfillment';
import {
  isValidPaidStatus,
  isPendingVerificationStatus,
  extractOrderAmount,
  formatWIBDateTime,
} from '@/lib/finance-engine';
import { getStorefrontInvoiceUrl } from '@/lib/storefront-urls';

export interface OrderItem {
  id: string;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items_summary?: string;
  quantity?: number;
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
  briefing_url?: string;
  customer_briefing?: any;
  is_archived?: boolean;
  created_at: string;
}

export interface OrdersTabProps {
  tenantSlug: string;
  storeDisplayName?: string;
  storePhone?: string;
  storeCity?: string;
  orders?: OrderItem[];
  loading?: boolean;
  onRefresh?: () => void;
  onOrderUpdated?: (order: OrderItem) => void;
}

export function mapRawOrder(o: any): OrderItem {
  const displayId = String(o.order_number || o.id || o.order_id || o.invoice_no || '');
  return {
    id: String(o.id || o.order_number || o.order_id || o.invoice_no || ''),
    invoice_no: displayId,
    customer_name: o.customer_name || 'Pelanggan Toko',
    customer_phone: o.customer_phone || '',
    customer_email: o.customer_email || '',
    items_summary: o.items_summary || o.product_name || o.product_title || 'Pesanan Produk',
    quantity: Number(o.quantity || o.metadata?.quantity || (Array.isArray(o.order_items) && o.order_items[0]?.quantity) || 1),
    total_amount: extractOrderAmount(o),
    payment_method: o.payment_method || 'QRIS Dinamis',
    payment_status: (o.status || o.payment_status || 'PENDING').toUpperCase(),
    status: (o.status || o.payment_status || 'PENDING').toUpperCase(),
    shipping_status: o.shipping_status,
    product_type: o.product_type,
    shipping_address: o.shipping_address,
    shipping_courier: o.shipping_courier,
    tracking_number: o.tracking_number,
    waybill: o.waybill,
    fulfillment_metadata: o.fulfillment_metadata,
    briefing_url: o.briefing_url || o.customer_briefing?.briefing_url || o.fulfillment_metadata?.briefing_url || o.fulfillment_metadata?.brief_url || '',
    customer_briefing: o.customer_briefing || (o.briefing_url ? { briefing_url: o.briefing_url } : null),
    is_archived: Boolean(o.is_archived),
    created_at: o.created_at || new Date().toISOString(),
  };
}

export default function OrdersTab({
  tenantSlug,
  storeDisplayName,
  storePhone,
  storeCity,
  orders: propOrders,
  loading: propLoading,
  onRefresh: propOnRefresh,
  onOrderUpdated,
}: OrdersTabProps) {
  const [internalOrders, setInternalOrders] = useState<OrderItem[]>(() => {
    return Array.isArray(propOrders) ? propOrders.map(mapRawOrder) : [];
  });
  const [internalLoading, setInternalLoading] = useState(!propOrders || propOrders.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [archiveFilter, setArchiveFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeState>(() => getDateRangeFromPreset('all'));

  // Sync propOrders ke internalOrders secara reaktif
  useEffect(() => {
    if (Array.isArray(propOrders)) {
      setInternalOrders(propOrders.map(mapRawOrder));
      setInternalLoading(false);
    }
  }, [propOrders]);

  const orders: OrderItem[] = internalOrders;
  const loading = propLoading ?? internalLoading;

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
      let url = `/api/orders?tenant=${encodeURIComponent(tenantSlug)}`;
      if (archiveFilter === 'ARCHIVED') {
        url += '&archived=true';
      } else if (archiveFilter === 'ALL') {
        url += '&include_archived=true';
      }
      if (dateRange.startDate) url += `&start_date=${encodeURIComponent(dateRange.startDate)}`;
      if (dateRange.endDate) url += `&end_date=${encodeURIComponent(dateRange.endDate)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.orders || data.data || []);
        const mappedList: OrderItem[] = rawList.map(mapRawOrder);
        setInternalOrders(mappedList);
      }
    } catch (err) {
      console.warn('Gagal memuat daftar pesanan:', err);
    } finally {
      setInternalLoading(false);
    }
  }, [tenantSlug, propOnRefresh, archiveFilter, dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    if (!propOrders || propOrders.length === 0) {
      fetchOrders();
    }
  }, [fetchOrders, propOrders]);

  const handleOrderUpdated = (updatedOrder: OrderItem) => {
    setInternalOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id || o.invoice_no === updatedOrder.invoice_no ? { ...o, ...updatedOrder } : o))
    );
    if (selectedOrder?.id === updatedOrder.id || selectedOrder?.invoice_no === updatedOrder.invoice_no) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...updatedOrder } : null));
    }
    onOrderUpdated?.(updatedOrder);
  };

  // Helper identifikasi pesanan manual yang berstatus pending/waiting_payment/verifikasi
  const isManualPendingPayment = (order: OrderItem) => {
    const paymentStatus = order.payment_status || order.status;
    const isPending =
      !isValidPaidStatus(paymentStatus) ||
      isPendingVerificationStatus(paymentStatus);
    
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

    return (isPending && isManual) || isPendingVerificationStatus(paymentStatus);
  };

  // Aksi Soft-Archive / Hide Order (Strict No-Hard-Delete)
  const handleToggleArchive = async (order: OrderItem, shouldArchive: boolean, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setArchivingId(order.id);
    const prevOrders = [...internalOrders];

    // Optimistic UI update
    const updated: OrderItem = { ...order, is_archived: shouldArchive };
    setInternalOrders((prev) =>
      prev.map((o) => (o.id === order.id || o.invoice_no === order.invoice_no ? updated : o))
    );
    if (selectedOrder?.id === order.id || selectedOrder?.invoice_no === order.invoice_no) {
      setSelectedOrder((prev) => (prev ? { ...prev, is_archived: shouldArchive } : null));
    }
    onOrderUpdated?.(updated);

    try {
      const res = await fetch(`/api/v1/orders/${encodeURIComponent(order.id)}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: shouldArchive }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memperbarui status arsip pesanan.');
      }

      setToast({
        message: shouldArchive
          ? `Pesanan #${order.invoice_no} berhasil diarsipkan.`
          : `Pesanan #${order.invoice_no} berhasil dipulihkan dari arsip.`,
        type: 'success',
      });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      console.warn('[OrdersTab] Error archiving order:', err);
      // Revert optimistic update on failure
      setInternalOrders(prevOrders);
      setToast({
        message: err.message || 'Gagal mengubah status arsip pesanan.',
        type: 'error',
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setArchivingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const query = searchQuery.toLowerCase();
    const matchSearch =
      !searchQuery ||
      o.invoice_no?.toLowerCase().includes(query) ||
      o.customer_name?.toLowerCase().includes(query) ||
      o.customer_phone?.includes(searchQuery);
    
    const pStatus = o.payment_status || o.status;
    const matchStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'PAID' && isValidPaidStatus(pStatus)) ||
      (statusFilter === 'VERIFICATION' && isPendingVerificationStatus(pStatus)) ||
      (statusFilter === 'UNPAID' && !isValidPaidStatus(pStatus) && !isPendingVerificationStatus(pStatus));

    // Filter Soft-Archive:
    // 1. "ACTIVE" (Default): hanya tampilkan yang is_archived !== true
    // 2. "ARCHIVED": hanya tampilkan yang is_archived === true
    // 3. "ALL": tampilkan semua status
    const matchArchive =
      archiveFilter === 'ALL' ||
      (archiveFilter === 'ACTIVE' && !o.is_archived) ||
      (archiveFilter === 'ARCHIVED' && Boolean(o.is_archived));

    const createdMs = new Date(o.created_at || Date.now()).getTime();
    const startMs = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
    const endMs = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Infinity;
    const matchDate = createdMs >= startMs && createdMs <= endMs;

    return matchSearch && matchStatus && matchArchive && matchDate;
  });

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Aksi Konfirmasi Bayar Manual (Tandai Lunas)
  const handleConfirmManualPayment = async (order: OrderItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsConfirmingPayment(true);
    const previousOrders = [...internalOrders];
    const previousSelected = selectedOrder ? { ...selectedOrder } : null;

    try {
      // 1. Optimistic update ke state lokal tabel
      const updatedOrder: OrderItem = {
        ...order,
        payment_status: 'PAID',
        status: 'PAID',
      };

      setInternalOrders((prev) =>
        prev.map((o) => (o.id === order.id || o.invoice_no === order.invoice_no ? updatedOrder : o))
      );

      if (selectedOrder?.id === order.id || selectedOrder?.invoice_no === order.invoice_no) {
        setSelectedOrder((prev) => (prev ? { ...prev, payment_status: 'PAID', status: 'PAID' } : null));
      }

      // 2. Request ke Next.js Quick-Paid API (menggunakan Service Role Supabase Admin, mutasi atomik & order_audit_logs)
      const targetOrderId = (order.id || (order as any).order_number || order.invoice_no || '').trim();
      const res = await fetch(
        `/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${encodeURIComponent(targetOrderId)}/quick-paid`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server menolak mutasi pembayaran (HTTP ${res.status})`);
      }

      // Pastikan state lokal mencerminkan order hasil mutasi database
      const confirmedOrder: OrderItem = data.order
        ? {
            ...updatedOrder,
            ...data.order,
            status: 'PAID',
            payment_status: 'PAID',
          }
        : updatedOrder;

      setInternalOrders((prev) =>
        prev.map((o) => (o.id === order.id || o.invoice_no === order.invoice_no ? confirmedOrder : o))
      );
      if (selectedOrder?.id === order.id || selectedOrder?.invoice_no === order.invoice_no) {
        setSelectedOrder(confirmedOrder);
      }
      onOrderUpdated?.(confirmedOrder);

      // 3. Request ke Core Backend status update endpoint (memicu event Purchase Meta CAPI jika online)
      try {
        await fetch(`https://api.boontrack.com/api/v1/orders/${encodeURIComponent(order.id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'LUNAS',
            payment_status: 'PAID',
            notes: 'Konfirmasi manual oleh admin toko',
          }),
        });
      } catch {}

      // 4. Tampilkan toast notifikasi sukses
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
      // ROLLBACK OPTIMISTIC STATE PADA KEGAGALAN MUTASI
      setInternalOrders(previousOrders);
      if (previousSelected) {
        setSelectedOrder(previousSelected);
      }
      const errMsg = err instanceof Error ? err.message : 'Gagal mengonfirmasi pembayaran.';
      setToast({
        message: `Gagal: ${errMsg}. Silakan coba lagi.`,
        type: 'error',
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const togglePaymentStatus = async (order: OrderItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const currentIsPaid = order.payment_status === 'PAID' || order.status === 'PAID';
    const newStatus = currentIsPaid ? 'UNPAID' : 'PAID';
    setTogglingId(order.id);
    const previousOrders = [...internalOrders];
    const previousSelected = selectedOrder ? { ...selectedOrder } : null;

    try {
      const updatedOrder: OrderItem = {
        ...order,
        payment_status: newStatus,
        status: newStatus,
      };

      // 1. Optimistic update
      setInternalOrders((prev) =>
        prev.map((o) => (o.id === order.id || o.invoice_no === order.invoice_no ? updatedOrder : o))
      );
      if (selectedOrder?.id === order.id || selectedOrder?.invoice_no === order.invoice_no) {
        setSelectedOrder((prev) => prev ? { ...prev, payment_status: newStatus, status: newStatus } : null);
      }

      // If newStatus is PAID, trigger quick-paid endpoint (server-side admin mutation)
      if (newStatus === 'PAID') {
        const targetOrderId = (order.id || (order as any).order_number || order.invoice_no || '').trim();
        const res = await fetch(
          `/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${encodeURIComponent(targetOrderId)}/quick-paid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Gagal mengubah status menjadi PAID di server');
        }
        if (data.order) {
          const finalOrder = { ...updatedOrder, ...data.order, status: 'PAID', payment_status: 'PAID' };
          setInternalOrders((prev) =>
            prev.map((o) => (o.id === order.id || o.invoice_no === order.invoice_no ? finalOrder : o))
          );
          onOrderUpdated?.(finalOrder);
        } else {
          onOrderUpdated?.(updatedOrder);
        }
      } else {
        // fallback API route for UNPAID
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_status: newStatus, status: newStatus, paid_at: null }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Gagal mengubah status menjadi UNPAID di server');
        }
        onOrderUpdated?.(updatedOrder);
      }

      setToast({
        message: `Status pesanan #${order.invoice_no} diubah menjadi ${newStatus}.`,
        type: 'success',
      });
      setTimeout(() => setToast(null), 3000);
    } catch (err: unknown) {
      console.warn('[OrdersTab] Error toggling payment_status:', err);
      // Rollback
      setInternalOrders(previousOrders);
      if (previousSelected) setSelectedOrder(previousSelected);
      const errMsg = err instanceof Error ? err.message : 'Gagal mengubah status pesanan.';
      setToast({
        message: `Gagal: ${errMsg}`,
        type: 'error',
      });
      setTimeout(() => setToast(null), 4000);
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
            <span>Daftar Pesanan Toko ({filteredOrders.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pantau seluruh transaksi checkout masuk, verifikasi konfirmasi pembayaran manual, dan pemenuhan pesanan instan.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* BULK EXPORT: Lincah.id Mass Upload CSV */}
          <button
            type="button"
            id="orders-export-lincah-btn"
            onClick={() =>
              exportOrdersToLincahCsv(
                filteredOrders.filter((o) => {
                  const reqs = resolveFulfillmentRequirements(
                    o.product_type || (o.shipping_address ? 'PHYSICAL' : 'DIGITAL')
                  );
                  return reqs.requiresShipping;
                }),
                tenantSlug
              )
            }
            disabled={filteredOrders.length === 0}
            className="bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="Export pesanan fisik ke format CSV Lincah.id (Mass Upload)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Lincah CSV</span>
          </button>

          <button
            type="button"
            id="orders-refresh-btn"
            onClick={fetchOrders}
            disabled={loading}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan Data</span>
          </button>
        </div>
      </div>

      {/* Filter Bar & Tabel Pesanan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 justify-between relative z-20 overflow-visible">
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

          <div className="flex flex-wrap items-center gap-2 relative z-30 overflow-visible">
            {/* Opsi Tampilan Soft-Archive (SPRINT 3) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/80">
              <button
                type="button"
                id="orders-filter-active-btn"
                onClick={() => setArchiveFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                  archiveFilter === 'ACTIVE'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Tampilkan hanya pesanan aktif (default)"
              >
                Pesanan Aktif
              </button>
              <button
                type="button"
                id="orders-filter-archived-btn"
                onClick={() => setArchiveFilter('ARCHIVED')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] flex items-center gap-1 ${
                  archiveFilter === 'ARCHIVED'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Tampilkan pesanan yang disembunyikan/diarsipkan"
              >
                <Archive className="w-3 h-3" />
                <span>Diarsipkan</span>
              </button>
              <button
                type="button"
                id="orders-filter-all-btn"
                onClick={() => setArchiveFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                  archiveFilter === 'ALL'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Tampilkan semua pesanan tanpa terkecuali"
              >
                Semua Pesanan
              </button>
            </div>

            <DateRangePicker value={dateRange} onChange={setDateRange} />

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status</option>
                <option value="UNPAID">Menunggu Pembayaran / Belum Lunas</option>
                <option value="VERIFICATION">Menunggu Verifikasi Manual (ORDER_PENDING_VERIFICATION)</option>
                <option value="PAID">Lunas (Paid / Verified)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full rounded-b-2xl">
          <table className="w-full min-w-[640px] text-left border-collapse text-xs">
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedOrder(ord);
                          }}
                          className="hover:text-blue-600 hover:underline cursor-pointer text-left"
                        >
                          {ord.invoice_no}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{ord.customer_name || 'Pelanggan Toko'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{ord.customer_phone || '-'}</div>
                        {ord.items_summary && (
                          <div className="text-[10px] text-slate-500 font-medium truncate max-w-[200px] flex items-center gap-1 mt-0.5">
                            <span className="truncate">{ord.items_summary}</span>
                            {ord.quantity && ord.quantity > 1 ? (
                              <span className="bg-slate-100 text-slate-700 font-bold px-1 rounded text-[9px]">
                                x{ord.quantity}
                              </span>
                            ) : null}
                          </div>
                        )}
                        {ord.briefing_url ? (
                          <div className="mt-1">
                            <a
                              href={normalizeBriefingUrl(ord.briefing_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 transition cursor-pointer"
                              title="Buka Dokumen Briefing Klien"
                            >
                              <FileText className="w-2.5 h-2.5 text-purple-600" />
                              <span>Briefing Klien ↗</span>
                            </a>
                          </div>
                        ) : null}
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
                      <td className="py-2.5 px-3 font-black text-slate-900 font-mono whitespace-nowrap">
                        Rp {Math.round(Number(ord.total_amount || 0)).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[11px] font-semibold text-slate-600">
                        {ord.payment_method || 'QRIS / TRANSFER'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-black border ${
                              isPaid
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isPendingVerificationStatus(ord.payment_status || ord.status)
                                ? 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold animate-pulse'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {isPaid
                              ? 'LUNAS (PAID)'
                              : isPendingVerificationStatus(ord.payment_status || ord.status)
                              ? 'MENUNGGU VERIFIKASI'
                              : 'PENDING'}
                          </span>
                          {ord.is_archived && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <Archive className="w-2.5 h-2.5 text-slate-500" />
                              Diarsipkan
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* TOMBOL AKSI MANUAL: KONFIRMASI BAYAR / TANDAI LUNAS */}
                          {needsManualConfirm && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOrderToConfirm(ord);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs hover:shadow transition-all active:scale-95 cursor-pointer shrink-0"
                              title="Konfirmasi Pembayaran Manual / Tandai Lunas"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Konfirmasi Bayar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedOrder(ord);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Lihat Rincian Pesanan"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (typeof window !== 'undefined') {
                                const invUrl = getStorefrontInvoiceUrl(tenantSlug, ord.invoice_no || ord.id);
                                window.open(invUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            title="Buka Lembar Invoice Resmi (shop.boontrack.com)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Paid / Unpaid inline */}
                          <button
                            type="button"
                            title={isPaid ? 'Tandai Unpaid' : 'Tandai Paid'}
                            disabled={togglingId === ord.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              togglePaymentStatus(ord, e);
                            }}
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

                          {/* Tombol Arsipkan (Soft-Archive) atau Pulihkan */}
                          {ord.is_archived ? (
                            <button
                              type="button"
                              disabled={archivingId === ord.id}
                              onClick={(e) => handleToggleArchive(ord, false, e)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer disabled:opacity-50"
                              title="Pulihkan / Batalkan Arsip Pesanan"
                            >
                              {archivingId === ord.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ArchiveRestore className="w-3.5 h-3.5 text-slate-600" />
                              )}
                              <span>Pulihkan</span>
                            </button>
                          ) : !isPaid ? (
                            <button
                              type="button"
                              disabled={archivingId === ord.id}
                              onClick={(e) => handleToggleArchive(ord, true, e)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[10px] bg-rose-50/60 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                              title="Arsipkan Pesanan (Sembunyikan Unpaid/Pending/Dobel)"
                            >
                              {archivingId === ord.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-rose-600" />
                              )}
                              <span>Arsipkan</span>
                            </button>
                          ) : null}

                          {/* Quick Print Label Resi (HANYA jika produk fisik & requires_shipping === true, BUKAN DIGITAL / SERVICE) */}
                          {(() => {
                            const normType = String(ord.product_type || '').toUpperCase();
                            const isDigitalOrService = normType === 'DIGITAL' || normType === 'SERVICE' || normType === 'FIELD_SERVICE' || normType === 'AGENCY' || normType === 'JASA' || normType === 'CREATOR';
                            const reqs = resolveFulfillmentRequirements(ord.product_type || (ord.shipping_address ? 'PHYSICAL' : 'DIGITAL'));
                            return !isDigitalOrService && reqs.requiresShipping;
                          })() && (
                            <button
                              type="button"
                              id={`orders-print-label-${ord.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                printThermalShippingLabel(ord, {
                                  name: storeDisplayName || tenantSlug,
                                  phone: storePhone,
                                  city: storeCity,
                                });
                              }}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="Cetak Label Resi Thermal 10x15cm"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}

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
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedOrder(null);
            }}
          >
            <div
              className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedOrder(null);
                  }}
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
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Produk:</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 text-right">
                      <span>{selectedOrder.items_summary}</span>
                      {selectedOrder.quantity && selectedOrder.quantity > 1 ? (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-1.5 py-0.5 rounded">
                          x{selectedOrder.quantity}
                        </span>
                      ) : null}
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

                    {/* Dokumen Briefing Klien */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-slate-500 font-medium">Dokumen Briefing:</span>
                      {selectedOrder.briefing_url ? (
                        <a
                          href={normalizeBriefingUrl(selectedOrder.briefing_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition shadow-xs cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-purple-600" />
                          <span>Buka Briefing Klien (External Link ↗)</span>
                          <ExternalLink className="w-3 h-3 text-purple-500" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Tidak menyertakan dokumen briefing
                        </span>
                      )}
                    </div>
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedOrder(null);
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Tutup
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* TOMBOL KONFIRMASI BAYAR MANUAL DARI MODAL DETAIL */}
                  {needsManualConfirm && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOrderToConfirm(selectedOrder);
                      }}
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePaymentStatus(selectedOrder, e);
                    }}
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

                  {/* Print Label Resi Thermal (HANYA untuk pesanan fisik, BUKAN DIGITAL / SERVICE) */}
                  {(() => {
                    const normType = String(selectedOrder.product_type || '').toUpperCase();
                    const isDigitalOrService = normType === 'DIGITAL' || normType === 'SERVICE' || normType === 'FIELD_SERVICE' || normType === 'AGENCY' || normType === 'JASA' || normType === 'CREATOR';
                    return !isDigitalOrService && orderReqs.requiresShipping;
                  })() && (
                    <button
                      type="button"
                      id={`orders-modal-print-label-${selectedOrder.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        printThermalShippingLabel(selectedOrder, {
                          name: storeDisplayName || tenantSlug,
                          phone: storePhone,
                          city: storeCity,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Label Resi</span>
                    </button>
                  )}

                  {/* Buka & Cetak Invoice Resmi (Universal Invoice Viewer di Domain Storefront) */}
                  <button
                    type="button"
                    id={`orders-modal-print-invoice-${selectedOrder.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (typeof window !== 'undefined') {
                        const invUrl = getStorefrontInvoiceUrl(tenantSlug, selectedOrder.invoice_no || selectedOrder.id);
                        window.open(invUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Lihat &amp; Cetak Invoice</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>

                  {/* Soft-Archive / Pulihkan Pesanan di Modal */}
                  {selectedOrder.is_archived ? (
                    <button
                      type="button"
                      disabled={archivingId === selectedOrder.id}
                      onClick={(e) => handleToggleArchive(selectedOrder, false, e)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer disabled:opacity-50"
                      title="Pulihkan Pesanan dari Arsip"
                    >
                      {archivingId === selectedOrder.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArchiveRestore className="w-3.5 h-3.5 text-slate-600" />
                      )}
                      <span>Pulihkan Pesanan</span>
                    </button>
                  ) : !isOrderPaid ? (
                    <button
                      type="button"
                      disabled={archivingId === selectedOrder.id}
                      onClick={(e) => handleToggleArchive(selectedOrder, true, e)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                      title="Sembunyikan / Arsipkan Pesanan Ini"
                    >
                      {archivingId === selectedOrder.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span>Arsipkan Pesanan</span>
                    </button>
                  ) : null}

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
        <div
          className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (!isConfirmingPayment) {
              e.preventDefault();
              e.stopPropagation();
              setOrderToConfirm(null);
            }
          }}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200 text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOrderToConfirm(null);
                }}
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOrderToConfirm(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={(e) => handleConfirmManualPayment(orderToConfirm, e)}
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
