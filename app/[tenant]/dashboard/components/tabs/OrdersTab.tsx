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
  AlertCircle 
} from 'lucide-react';
import GodPayButton, { OrderItem as GodPayOrderItem } from '../orders/GodPayButton';
import { 
  resolveFulfillmentRequirements, 
  ProductType, 
  FulfillmentMetadata 
} from '@/lib/product-catalog';

export interface OrderItem {
  id: string;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items_summary?: string;
  total_amount: number;
  payment_method?: string;
  payment_status: 'UNPAID' | 'PAID' | 'FAILED' | string;
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

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);

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
            Pantau seluruh transaksi checkout masuk, pemenuhan pesanan (fulfillment boundary), dan verifikasi instan.
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Lihat Rincian Pesanan"
                          >
                            <Eye className="w-3.5 h-3.5" />
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

      {/* Modal Detail Pesanan & Fulfillment Boundary */}
      {selectedOrder && (() => {
        const orderReqs = resolveFulfillmentRequirements(
          selectedOrder.product_type || (selectedOrder.shipping_address ? 'PHYSICAL' : 'DIGITAL')
        );
        const meta = selectedOrder.fulfillment_metadata;

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
                    <p className="text-[11px] text-slate-500">ID: {selectedOrder.id}</p>
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
                        selectedOrder.payment_status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {selectedOrder.payment_status === 'PAID' ? 'LUNAS (PAID)' : 'BELUM LUNAS (UNPAID)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Metode Pembayaran:</span>
                    <span className="font-bold text-slate-800 uppercase font-mono">
                      {selectedOrder.payment_method || 'QRIS'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                    <span className="font-bold text-slate-700">Total Nominal:</span>
                    <span className="text-sm font-black text-emerald-600">
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
                        <span>Logistik & Ekspedisi Pengiriman Fisik</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Pengiriman Non-Fisik & Akses Langsung</span>
                      </>
                    )}
                  </h4>

                  {orderReqs.requiresShipping ? (
                    /* Bagian Khusus Produk Fisik */
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
                    /* Bagian Khusus Produk Non-Fisik (Digital / Jasa / Agency) - Tanpa placeholder resi/kurir fisik */
                    <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Strategi Fulfillment:</span>
                        <span className="font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded text-[10px]">
                          Bebas Pengiriman Fisik & Tanpa Resi Kurir
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

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Tutup
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
        );
      })()}
    </div>
  );
}
