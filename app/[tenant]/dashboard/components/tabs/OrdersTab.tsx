import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingBag, 
  RefreshCw, 
  Search, 
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
  Upload,
  MessageCircle,
} from 'lucide-react';
import BulkImportOrdersModal from '@/components/orders/BulkImportOrdersModal';
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
  MetaCsvExportSummary,
} from '@/lib/utils/orderFulfillment';
import { MetaCsvExportSummaryModal } from '../MetaCsvExportSummaryModal';
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
  onOrdersSynced?: (orders: OrderItem[]) => void;
  swrIntervalMs?: number;
}

export function mapRawOrder(o: any): OrderItem {
  if (!o) return {} as OrderItem;
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
    payment_status: String(o.status || o.payment_status || 'PENDING').toUpperCase(),
    status: String(o.status || o.payment_status || 'PENDING').toUpperCase(),
    shipping_status: o.shipping_status,
    product_type: o?.product_type,
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

export function getDigitalWhatsAppResendUrl(order: OrderItem, storeName: string): string | null {
  const phone = (order.customer_phone || '').replace(/\D/g, '').replace(/^0/, '62');
  if (!phone) return null;
  const meta = order.fulfillment_metadata;
  const name = order.customer_name || 'Pelanggan';
  const invoice = order.invoice_no || order.id || '';
  const accessUrl = meta?.access_url || '';
  const licenseKey = meta?.license_key || '';
  const instructions = meta?.instructions || '';

  let message = `Halo ${name}, terima kasih telah memesan di ${storeName} (Invoice: ${invoice}).\n\nBerikut rincian akses produk digital Anda:`;
  if (accessUrl) message += `\n🔗 Link Akses: ${accessUrl}`;
  if (licenseKey) message += `\n🔑 Lisensi: ${licenseKey}`;
  if (instructions) message += `\n📝 Petunjuk: ${instructions}`;
  message += `\n\nJika membutuhkan bantuan lebih lanjut, silakan balas pesan ini. Terima kasih!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

const EXPIRED_ORDER_STATUSES = new Set(['EXPIRED', 'FAILED', 'CANCELLED', 'VOID']);

function isExpiredOrderStatus(rawStatus?: string | null): boolean {
  if (!rawStatus) return false;
  return EXPIRED_ORDER_STATUSES.has(String(rawStatus).trim().toUpperCase());
}

function resolveOrderStatusMeta(rawStatus?: string | null): {
  key: 'PAID' | 'VERIFICATION' | 'PENDING' | 'EXPIRED';
  label: string;
  badgeClass: string;
} {
  const normalized = String(rawStatus || 'PENDING').trim().toUpperCase();
  if (isValidPaidStatus(normalized)) {
    return {
      key: 'PAID',
      label: 'PAID',
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
    };
  }
  if (isExpiredOrderStatus(normalized)) {
    return {
      key: 'EXPIRED',
      label:
        normalized === 'FAILED'
          ? 'FAILED'
          : normalized === 'CANCELLED'
          ? 'CANCELLED'
          : 'EXPIRED',
      badgeClass:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70',
    };
  }
  if (isPendingVerificationStatus(normalized)) {
    return {
      key: 'VERIFICATION',
      label: 'VERIFIKASI',
      badgeClass:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/70',
    };
  }
  return {
    key: 'PENDING',
    label: normalized === 'UNPAID' ? 'UNPAID' : 'PENDING',
    badgeClass:
      'bg-amber-50/80 text-amber-700 border-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-800/60',
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
  onOrdersSynced,
  swrIntervalMs,
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);

  // State untuk ringkasan ekspor Meta CSV (Audit & Validasi Ketat)
  const [metaExportSummary, setMetaExportSummary] = useState<MetaCsvExportSummary | null>(null);
  const [isExportSummaryModalOpen, setIsExportSummaryModalOpen] = useState(false);

  // State untuk dialog konfirmasi pembayaran manual
  const [orderToConfirm, setOrderToConfirm] = useState<OrderItem | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  // State floating toast notifikasi
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isFetchingRef = React.useRef(false);
  const activeAbortRef = React.useRef<AbortController | null>(null);

  // Sync propOrders ke internalOrders secara reaktif (tanpa menimpa status PAID yang sudah valid)
  useEffect(() => {
    if (Array.isArray(propOrders) && propOrders.length > 0) {
      setInternalOrders((prev) => {
        if (!prev || prev.length === 0) {
          return propOrders.map(mapRawOrder);
        }
        const prevMap = new Map(prev.map((o) => [o.id, o]));
        return propOrders.map((raw) => {
          const mapped = mapRawOrder(raw);
          const existing = prevMap.get(mapped.id);
          if (
            existing &&
            isValidPaidStatus(existing.payment_status || existing.status) &&
            !isValidPaidStatus(mapped.payment_status || mapped.status)
          ) {
            return { ...mapped, ...existing };
          }
          return mapped;
        });
      });
      setInternalLoading(false);
    }
  }, [propOrders]);

  const orders: OrderItem[] = internalOrders;
  const loading = propLoading ?? internalLoading;

  // SWR Revalidation: fetch data pesanan terbaru secara efisien dan mutlak terisolasi per tenant
  const fetchOrders = useCallback(
    async (options?: { isBackground?: boolean }) => {
      const isBackground = options?.isBackground === true;
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (!isBackground) {
        setInternalLoading(true);
      }

      try {
        if (activeAbortRef.current) {
          activeAbortRef.current.abort();
        }
        const controller = new AbortController();
        activeAbortRef.current = controller;

        let url = `/api/orders?tenant=${encodeURIComponent(tenantSlug)}`;
        if (archiveFilter === 'ARCHIVED') {
          url += '&archived=true';
        } else if (archiveFilter === 'ALL') {
          url += '&include_archived=true';
        }
        if (dateRange.startDate) url += `&start_date=${encodeURIComponent(dateRange.startDate)}`;
        if (dateRange.endDate) url += `&end_date=${encodeURIComponent(dateRange.endDate)}`;

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          const rawList = Array.isArray(data)
            ? data
            : Array.isArray(data?.orders)
            ? data.orders
            : Array.isArray(data?.data)
            ? data.data
            : [];
          const mappedList: OrderItem[] = rawList.map(mapRawOrder);

          setInternalOrders((prev) => {
            const prevMap = new Map(prev.map((o) => [o.id, o]));
            const newlyPaidOrders: OrderItem[] = [];
            let hasAnyDiff = prev.length !== mappedList.length;

            for (const newOrd of mappedList) {
              const oldOrd = prevMap.get(newOrd.id);
              if (!oldOrd) {
                hasAnyDiff = true;
              } else {
                const oldStatus = oldOrd.payment_status || oldOrd.status;
                const newStatus = newOrd.payment_status || newOrd.status;
                if (
                  oldStatus !== newStatus ||
                  oldOrd.is_archived !== newOrd.is_archived ||
                  oldOrd.shipping_status !== newOrd.shipping_status
                ) {
                  hasAnyDiff = true;
                  if (!isValidPaidStatus(oldStatus) && isValidPaidStatus(newStatus)) {
                    newlyPaidOrders.push(newOrd);
                  }
                }
              }
            }

            if (hasAnyDiff) {
              for (const newOrd of mappedList) {
                const oldOrd = prevMap.get(newOrd.id);
                if (oldOrd) {
                  const oldStatus = oldOrd.payment_status || oldOrd.status;
                  const newStatus = newOrd.payment_status || newOrd.status;
                  if (oldStatus !== newStatus) {
                    onOrderUpdated?.(newOrd);
                    if (selectedOrder?.id === newOrd.id || selectedOrder?.invoice_no === newOrd.invoice_no) {
                      setSelectedOrder(newOrd);
                    }
                  }
                }
              }
              onOrdersSynced?.(mappedList);

              if (newlyPaidOrders.length > 0) {
                const first = newlyPaidOrders[0];
                setToast({
                  message: `Pesanan #${first.invoice_no} (${first.customer_name}) berhasil diverifikasi LUNAS!`,
                  type: 'success',
                });
                setTimeout(() => setToast(null), 4000);
              }

              return mappedList;
            }

            return prev;
          });
        }
        propOnRefresh?.();
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[OrdersTab SWR] Gagal memuat pesanan:', err);
        }
      } finally {
        isFetchingRef.current = false;
        if (!isBackground) {
          setInternalLoading(false);
        }
      }
    },
    [tenantSlug, archiveFilter, dateRange.startDate, dateRange.endDate, onOrderUpdated, onOrdersSynced, propOnRefresh, selectedOrder]
  );

  // SWR Realtime Polling & Window Focus / Visibility Invalidation
  useEffect(() => {
    if (!tenantSlug) return;

    // 1. Initial fetch on mount (background fetch jika initial propOrders sudah tersedia)
    fetchOrders({ isBackground: Array.isArray(propOrders) && propOrders.length > 0 });

    // 2. Periodic SWR polling (default 5 detik)
    const intervalMs = swrIntervalMs || 5000;
    const timer = setInterval(() => {
      // Hanya polling jika tab / dokumen browser sedang aktif dilihat (hemat resource & query)
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchOrders({ isBackground: true });
    }, intervalMs);

    // 3. Window focus & visibilitychange revalidation
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchOrders({ isBackground: true });
      }
    };

    // 4. Custom window events (order:paid, order:updated, swr:revalidate:orders)
    const handleCustomRevalidate = () => {
      fetchOrders({ isBackground: true });
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('swr:revalidate:orders', handleCustomRevalidate);
    window.addEventListener('order:paid', handleCustomRevalidate);
    window.addEventListener('order:updated', handleCustomRevalidate);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('swr:revalidate:orders', handleCustomRevalidate);
      window.removeEventListener('order:paid', handleCustomRevalidate);
      window.removeEventListener('order:updated', handleCustomRevalidate);
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, [tenantSlug, fetchOrders, swrIntervalMs, propOrders]);

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

  const safeOrdersList = Array.isArray(orders) ? orders : [];
  const baseScopedOrders = safeOrdersList.filter((o) => {
    if (!o) return false;
    const query = (searchQuery || '').toLowerCase();
    const matchSearch =
      !searchQuery ||
      Boolean(o.invoice_no && o.invoice_no.toLowerCase().includes(query)) ||
      Boolean(o.customer_name && o.customer_name.toLowerCase().includes(query)) ||
      Boolean(o.customer_phone && o.customer_phone.includes(searchQuery)) ||
      Boolean(o.items_summary && o.items_summary.toLowerCase().includes(query));

    // Filter Soft-Archive:
    // 1. "ACTIVE" (Default): hanya tampilkan yang is_archived !== true
    // 2. "ARCHIVED": hanya tampilkan yang is_archived === true
    // 3. "ALL": tampilkan semua status
    const matchArchive =
      archiveFilter === 'ALL' ||
      (archiveFilter === 'ACTIVE' && !o.is_archived) ||
      (archiveFilter === 'ARCHIVED' && Boolean(o.is_archived));

    const createdMs = o.created_at ? new Date(o.created_at).getTime() : NaN;
    const startMs = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
    const endMs = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Infinity;
    const matchDate =
      (!dateRange.startDate && !dateRange.endDate) ||
      (!Number.isNaN(createdMs) && createdMs >= startMs && createdMs <= endMs);

    return matchSearch && matchArchive && matchDate;
  });

  const statusCounts = baseScopedOrders.reduce(
    (acc, o) => {
      const pStatus = o.payment_status || o.status;
      if (isValidPaidStatus(pStatus)) {
        acc.PAID += 1;
      } else if (isExpiredOrderStatus(pStatus)) {
        acc.EXPIRED += 1;
      } else {
        acc.PENDING += 1;
        if (isPendingVerificationStatus(pStatus)) {
          acc.VERIFICATION += 1;
        }
      }
      acc.ALL += 1;
      return acc;
    },
    { ALL: 0, PAID: 0, PENDING: 0, EXPIRED: 0, VERIFICATION: 0 }
  );

  const filteredOrders = baseScopedOrders.filter((o) => {
    const pStatus = o.payment_status || o.status;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PAID') return isValidPaidStatus(pStatus);
    if (statusFilter === 'EXPIRED') return isExpiredOrderStatus(pStatus);
    if (statusFilter === 'VERIFICATION') return isPendingVerificationStatus(pStatus);
    if (statusFilter === 'PENDING') {
      return !isValidPaidStatus(pStatus) && !isExpiredOrderStatus(pStatus);
    }
    return (
      !isValidPaidStatus(pStatus) &&
      !isPendingVerificationStatus(pStatus) &&
      !isExpiredOrderStatus(pStatus)
    );
  });

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
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-4">
      {/* Header Ringkas Tab Transaksi & Pesanan */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              id="orders-table-heading"
              className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Transaksi &amp; Pesanan</span>
            </h2>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 tabular-nums">
              {filteredOrders.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Pantau transaksi checkout, verifikasi pembayaran manual, ekspor laporan, dan pemenuhan pesanan.
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
          {/* BULK IMPORT EXCEL / CSV ACTIONS */}
          <a
            href="/api/orders/bulk-import/template?format=xlsx"
            download="template-import-pesanan-boontrack.xlsx"
            id="orders-download-template-btn"
            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download format standar kolom pesanan (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Template .xlsx</span>
          </a>

          <button
            type="button"
            id="orders-import-excel-btn"
            onClick={() => setIsImportModalOpen(true)}
            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Import pesanan massal dari file Excel (.xlsx) atau CSV"
          >
            <Upload className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Import Excel/CSV</span>
          </button>

          {/* BULK EXPORT: Meta Offline Conversions & CAPI CSV (WP4-CT EMERGENCY CONTAINMENT: FAIL-CLOSED DISABLED) */}
          <button
            type="button"
            id="orders-export-meta-csv-btn"
            disabled={true}
            aria-disabled="true"
            className="bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 font-medium px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-not-allowed opacity-60"
            title="Ekspor Meta Offline CSV dinonaktifkan sementara demi perlindungan data (WP4-CT Containment). Menunggu rilis endpoint server terverifikasi."
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Ekspor Meta CSV (Dinonaktifkan)</span>
          </button>

          {/* BULK EXPORT: Lincah.id Mass Upload CSV */}
          <button
            type="button"
            id="orders-export-lincah-btn"
            onClick={() =>
              exportOrdersToLincahCsv(
                filteredOrders.filter((o) => {
                  if (!o) return false;
                  const reqs = resolveFulfillmentRequirements(
                    o?.product_type || (o?.shipping_address ? 'PHYSICAL' : 'DIGITAL')
                  );
                  return reqs.requiresShipping;
                }),
                tenantSlug
              )
            }
            disabled={filteredOrders.length === 0}
            className="bg-white dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-semibold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Export pesanan fisik ke format CSV Lincah.id (Mass Upload)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Lincah CSV</span>
          </button>

          <button
            type="button"
            id="orders-refresh-btn"
            onClick={() => fetchOrders({ isBackground: false })}
            disabled={loading}
            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Filter Bar & Dense Transaction Table */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2.5 relative z-20 overflow-visible">
          {/* Row 1: Pencarian, Filter Status Pembayaran, & Rentang Tanggal */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="relative flex-1 w-full lg:max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari no. invoice, nama pelanggan, WhatsApp..."
                aria-label="Cari no. invoice atau pelanggan"
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 relative z-30 overflow-visible">
              {/* Segmented Filter Status Pembayaran: Semua, Paid, Pending, Expired (+ Verifikasi bila ada) */}
              <div
                role="group"
                aria-label="Filter status pembayaran"
                className="inline-flex flex-wrap items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900 p-0.5 gap-0.5"
              >
                {[
                  { id: 'ALL', label: 'Semua', count: statusCounts.ALL },
                  { id: 'PAID', label: 'Paid', count: statusCounts.PAID },
                  { id: 'PENDING', label: 'Pending', count: statusCounts.PENDING },
                  { id: 'EXPIRED', label: 'Expired', count: statusCounts.EXPIRED },
                ].map((opt) => {
                  const isSelected = statusFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStatusFilter(opt.id)}
                      aria-pressed={isSelected}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[10px] opacity-70 tabular-nums">{opt.count}</span>
                    </button>
                  );
                })}
                {statusCounts.VERIFICATION > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('VERIFICATION')}
                    aria-pressed={statusFilter === 'VERIFICATION'}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'VERIFICATION'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                    }`}
                  >
                    <span>Verifikasi</span>
                    <span className="text-[10px] opacity-85 tabular-nums">{statusCounts.VERIFICATION}</span>
                  </button>
                )}
              </div>

              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </div>

          {/* Row 2: Soft-Archive Filter & Ringkasan Jumlah */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-0.5 bg-slate-100/80 dark:bg-slate-900 p-0.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                id="orders-filter-active-btn"
                onClick={() => setArchiveFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  archiveFilter === 'ACTIVE'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Tampilkan hanya pesanan aktif (default)"
              >
                Pesanan Aktif
              </button>
              <button
                type="button"
                id="orders-filter-archived-btn"
                onClick={() => setArchiveFilter('ARCHIVED')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  archiveFilter === 'ARCHIVED'
                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  archiveFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Tampilkan semua pesanan tanpa terkecuali"
              >
                Semua Pesanan
              </button>
            </div>

            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tabular-nums">
              Menampilkan {filteredOrders.length} transaksi
            </span>
          </div>
        </div>

        {/* TABLE SHELL */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1117] rounded-xl overflow-hidden">
          {/* DESKTOP DENSE TRANSACTION TABLE */}
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="orders-table-heading"
            className="hidden md:block overflow-x-auto focus:outline-none"
          >
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    No. Invoice
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Tanggal / Waktu (WIB)
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Pelanggan &amp; Kontak
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Rincian Item Produk
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Metode Bayar
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                    Total Nominal
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-center whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                    Rincian
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-500 dark:text-slate-400 text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Memuat transaksi pesanan...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-500 dark:text-slate-400 text-xs">
                      Belum ada data pesanan yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => {
                    if (!ord) return null;
                    const reqs = resolveFulfillmentRequirements(
                      ord?.product_type || (ord?.shipping_address ? 'PHYSICAL' : 'DIGITAL')
                    );
                    const isPaid = isValidPaidStatus(ord.payment_status || ord.status);
                    const needsManualConfirm = isManualPendingPayment(ord);
                    const statusMeta = resolveOrderStatusMeta(ord.payment_status || ord.status);
                    const normType = String(ord?.product_type || '').toUpperCase();
                    const isDigitalOrServiceType =
                      normType === 'DIGITAL' ||
                      normType === 'SERVICE' ||
                      normType === 'FIELD_SERVICE' ||
                      normType === 'AGENCY' ||
                      normType === 'JASA' ||
                      normType === 'CREATOR';
                    const canPrintLabel = !isDigitalOrServiceType && reqs.requiresShipping;
                    const canResendWaDigital =
                      (isDigitalOrServiceType || !reqs.requiresShipping) &&
                      getDigitalWhatsAppResendUrl(ord, storeDisplayName || tenantSlug);

                    return (
                      <tr
                        key={ord.id}
                        className="border-b last:border-b-0 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* 1. No. Invoice */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedOrder(ord);
                            }}
                            className="font-mono font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-left"
                          >
                            {ord.invoice_no}
                          </button>
                        </td>

                        {/* 2. Tanggal / Waktu (WIB) */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {ord.created_at ? formatWIBDateTime(ord.created_at) : '-'}
                        </td>

                        {/* 3. Nama Pelanggan & Kontak */}
                        <td className="py-2.5 px-3 max-w-[180px]">
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {ord.customer_name || 'Pelanggan Toko'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            {ord.customer_phone || '-'}
                          </div>
                          {ord.briefing_url ? (
                            <div className="mt-1">
                              <a
                                href={normalizeBriefingUrl(ord.briefing_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60 transition cursor-pointer"
                                title="Buka Dokumen Briefing Klien"
                              >
                                <FileText className="w-2.5 h-2.5" />
                                <span>Briefing ↗</span>
                              </a>
                            </div>
                          ) : null}
                        </td>

                        {/* 4. Rincian Item Produk */}
                        <td className="py-2.5 px-3 max-w-[230px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="font-medium text-slate-800 dark:text-slate-200 truncate"
                              title={ord.items_summary || 'Pesanan Produk'}
                            >
                              {ord.items_summary || 'Pesanan Produk'}
                            </span>
                            {ord.quantity && ord.quantity > 1 ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 shrink-0 tabular-nums">
                                x{ord.quantity}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5">
                            {reqs.requiresShipping ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                <Truck className="w-3 h-3 shrink-0" />
                                <span>{ord.shipping_courier || 'Ekspedisi'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                                <Sparkles className="w-3 h-3 shrink-0" />
                                <span>Digital / Direct</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Metode Pembayaran */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-semibold uppercase text-slate-700 dark:text-slate-300">
                            {ord.payment_method || 'QRIS / TRANSFER'}
                          </span>
                        </td>

                        {/* 6. Total Nominal */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          Rp {Math.round(Number(ord.total_amount || 0)).toLocaleString('id-ID')}
                        </td>

                        {/* 7. Status Transaksi */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex flex-col items-center gap-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
                            >
                              {statusMeta.label}
                            </span>
                            {ord.is_archived && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                <Archive className="w-2.5 h-2.5" />
                                <span>Diarsipkan</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 8. Tombol Rincian & Aksi Cepat */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            {needsManualConfirm && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOrderToConfirm(ord);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shrink-0"
                                title="Konfirmasi Pembayaran Manual / Tandai Lunas"
                              >
                                <CheckCircle2 className="w-3 h-3" />
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
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 text-[11px] font-medium transition-colors cursor-pointer"
                              title="Lihat Rincian Pesanan"
                            >
                              <Eye className="w-3 h-3 shrink-0" />
                              <span>Rincian</span>
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
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                              title="Buka Lembar Invoice Resmi"
                              aria-label={`Buka invoice ${ord.invoice_no}`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              title={isPaid ? 'Tandai Unpaid' : 'Tandai Paid'}
                              disabled={togglingId === ord.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePaymentStatus(ord, e);
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold text-[10px] border transition-colors cursor-pointer disabled:opacity-50 ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300'
                              }`}
                            >
                              {togglingId === ord.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isPaid ? (
                                <>
                                  <ToggleRight className="w-3 h-3" />
                                  <span>PAID</span>
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-3 h-3" />
                                  <span>UNPAID</span>
                                </>
                              )}
                            </button>

                            {ord.is_archived ? (
                              <button
                                type="button"
                                disabled={archivingId === ord.id}
                                onClick={(e) => handleToggleArchive(ord, false, e)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                                title="Pulihkan / Batalkan Arsip Pesanan"
                                aria-label={`Pulihkan ${ord.invoice_no}`}
                              >
                                {archivingId === ord.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ArchiveRestore className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : !isPaid ? (
                              <button
                                type="button"
                                disabled={archivingId === ord.id}
                                onClick={(e) => handleToggleArchive(ord, true, e)}
                                className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
                                title="Arsipkan Pesanan"
                                aria-label={`Arsipkan ${ord.invoice_no}`}
                              >
                                {archivingId === ord.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : null}

                            {canPrintLabel && (
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
                                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Cetak Label Resi Thermal 10x15cm"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canResendWaDigital && (
                              <a
                                href={canResendWaDigital}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                                title="Kirim Ulang Akses / Lisensi via WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
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

          {/* MOBILE COMPACT TRANSACTIONS LIST */}
          <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
            {loading && orders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>Memuat transaksi pesanan...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Belum ada data pesanan yang cocok.
              </div>
            ) : (
              filteredOrders.map((ord) => {
                if (!ord) return null;
                const statusMeta = resolveOrderStatusMeta(ord.payment_status || ord.status);
                const needsManualConfirm = isManualPendingPayment(ord);
                const isPaid = isValidPaidStatus(ord.payment_status || ord.status);

                return (
                  <div
                    key={ord.id}
                    className="p-3 bg-white dark:bg-[#0D1117] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(ord)}
                          className="font-mono text-xs font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                        >
                          {ord.invoice_no}
                        </button>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {ord.created_at ? formatWIBDateTime(ord.created_at) : '-'}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">
                          {ord.customer_name || 'Pelanggan Toko'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {ord.items_summary || 'Pesanan Produk'}
                          {ord.quantity && ord.quantity > 1 ? ` (x${ord.quantity})` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          Rp {Math.round(Number(ord.total_amount || 0)).toLocaleString('id-ID')}
                        </div>
                        <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
                          {ord.payment_method || 'QRIS'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end flex-wrap gap-1.5">
                      {needsManualConfirm && (
                        <button
                          type="button"
                          onClick={() => setOrderToConfirm(ord)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-[11px] bg-emerald-600 text-white cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Konfirmasi Bayar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(ord)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Rincian</span>
                      </button>
                      <button
                        type="button"
                        disabled={togglingId === ord.id}
                        onClick={(e) => togglePaymentStatus(ord, e)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold text-[10px] border cursor-pointer disabled:opacity-50 ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80'
                        }`}
                      >
                        <span>{isPaid ? 'PAID' : 'UNPAID'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL DETAIL PESANAN & FULFILLMENT BOUNDARY              */}
      {/* ======================================================== */}
      {selectedOrder && (() => {
        const orderReqs = resolveFulfillmentRequirements(
          selectedOrder?.product_type || (selectedOrder?.shipping_address ? 'PHYSICAL' : 'DIGITAL')
        );
        const meta = selectedOrder.fulfillment_metadata;
        const isOrderPaid = isValidPaidStatus(selectedOrder.payment_status || selectedOrder.status);
        const needsManualConfirm = isManualPendingPayment(selectedOrder);
        const detailStatusMeta = resolveOrderStatusMeta(
          selectedOrder.payment_status || selectedOrder.status
        );

        return (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedOrder(null);
            }}
          >
            <div
              className="bg-white dark:bg-[#0D1117] rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 dark:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/70">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      Rincian Pesanan: {selectedOrder.invoice_no}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      ID: {selectedOrder.id}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedOrder(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {/* 1. Status & Finansial */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Status Pembayaran:</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${detailStatusMeta.badgeClass}`}
                    >
                      {detailStatusMeta.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Waktu (WIB):</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {selectedOrder.created_at ? formatWIBDateTime(selectedOrder.created_at) : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Metode Pembayaran:</span>
                    <span className="font-bold text-slate-900 dark:text-white uppercase font-mono">
                      {selectedOrder.payment_method || 'QRIS / TRANSFER'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">Produk:</span>
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-right">
                      <span>{selectedOrder.items_summary}</span>
                      {selectedOrder.quantity && selectedOrder.quantity > 1 ? (
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200 text-[10px] font-black px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          x{selectedOrder.quantity}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
                    <span className="font-bold text-slate-900 dark:text-white">Total Nominal:</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                      Rp {selectedOrder.total_amount?.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* 2. Informasi Pelanggan */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Data Pelanggan</span>
                  </h4>
                  <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Nama:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {selectedOrder.customer_name || 'Pelanggan Toko'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">WhatsApp:</span>
                      <a
                        href={`https://wa.me/${(selectedOrder.customer_phone || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <span>{selectedOrder.customer_phone || '-'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {selectedOrder.customer_email && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Email:</span>
                        <span className="font-mono text-slate-900 dark:text-slate-200">{selectedOrder.customer_email}</span>
                      </div>
                    )}

                    {/* Dokumen Briefing Klien */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Dokumen Briefing:</span>
                      {selectedOrder.briefing_url ? (
                        <a
                          href={normalizeBriefingUrl(selectedOrder.briefing_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/80 border border-purple-200 dark:border-purple-800/70 transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                          <span>Buka Briefing Klien (External Link ↗)</span>
                          <ExternalLink className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                          Tidak menyertakan dokumen briefing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Fulfillment Strategy Boundary Section (Deterministik: Fisik vs Non-Fisik) */}
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    {orderReqs.requiresShipping ? (
                      <>
                        <Truck className="w-3.5 h-3.5 text-amber-500" />
                        <span>Logistik &amp; Ekspedisi Pengiriman Fisik</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        <span>Pengiriman Non-Fisik &amp; Akses Langsung</span>
                      </>
                    )}
                  </h4>

                  {orderReqs.requiresShipping ? (
                    <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Layanan Ekspedisi:</span>
                        <span className="font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded text-[11px]">
                          {selectedOrder.shipping_courier || 'Ekspedisi Reguler'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-1 border-t border-amber-200/80 dark:border-amber-800/40">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold">Alamat Tujuan:</span>
                        <p className="text-slate-900 dark:text-slate-100 leading-snug font-medium">
                          {selectedOrder.shipping_address || 'Belum mencantumkan alamat lengkap'}
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-amber-200/80 dark:border-amber-800/40">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Nomor Resi:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {selectedOrder.tracking_number || selectedOrder.waybill || 'Menunggu Resi'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">Strategi Fulfillment:</span>
                        <span className="font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 rounded text-[10px]">
                          Bebas Pengiriman Fisik &amp; Tanpa Resi Kurir
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Tipe Akses:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {meta?.delivery_type === 'DOWNLOAD_LINK'
                              ? 'Link Unduh Materi'
                              : meta?.delivery_type === 'LICENSE_KEY'
                              ? 'Kunci Lisensi'
                              : 'Formulir / Akses Langsung'}
                          </span>
                        </div>

                        {meta?.license_key && (
                          <div className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                              Kunci Lisensi Pembeli:
                            </span>
                            <div className="font-mono font-bold text-blue-600 dark:text-blue-400 select-all">
                              {meta.license_key}
                            </div>
                          </div>
                        )}

                        {meta?.instructions && (
                          <div className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-0.5">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                              Petunjuk:
                            </span>
                            <p className="text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-line">
                              {meta.instructions}
                            </p>
                          </div>
                        )}

                        {meta?.access_url && (
                          <a
                            href={meta.access_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1"
                          >
                            <span>Buka URL Akses Materi</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {selectedOrder.customer_phone && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              Kirim Informasi ke Pembeli:
                            </span>
                            <a
                              href={getDigitalWhatsAppResendUrl(selectedOrder, storeDisplayName || tenantSlug) || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Kirim Ulang WA</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedOrder(null);
                  }}
                  className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-950/80'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300'
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
                    const normType = String(selectedOrder?.product_type || '').toUpperCase();
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition cursor-pointer"
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
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-50"
                      title="Pulihkan Pesanan dari Arsip"
                    >
                      {archivingId === selectedOrder.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArchiveRestore className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      )}
                      <span>Pulihkan Pesanan</span>
                    </button>
                  ) : !isOrderPaid ? (
                    <button
                      type="button"
                      disabled={archivingId === selectedOrder.id}
                      onClick={(e) => handleToggleArchive(selectedOrder, true, e)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition cursor-pointer disabled:opacity-50"
                      title="Sembunyikan / Arsipkan Pesanan Ini"
                    >
                      {archivingId === selectedOrder.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-rose-500" />
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
          className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (!isConfirmingPayment) {
              e.preventDefault();
              e.stopPropagation();
              setOrderToConfirm(null);
            }
          }}
        >
          <div
            className="bg-white dark:bg-[#0D1117] rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Konfirmasi Pembayaran Manual</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Verifikasi penerimaan dana masuk</p>
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Invoice:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{orderToConfirm.invoice_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Pelanggan:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{orderToConfirm.customer_name || 'Pelanggan Toko'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">WhatsApp:</span>
                  <span className="font-mono text-slate-900 dark:text-slate-200">{orderToConfirm.customer_phone || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Metode Bayar:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200 uppercase">
                    {orderToConfirm.payment_method || 'Transfer Rekening / QRIS Manual'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-2">
                  <span className="font-bold text-slate-900 dark:text-white">Total Tagihan:</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    Rp {orderToConfirm.total_amount?.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Pastikan mutasi dana telah <strong>masuk ke rekening bank atau QRIS</strong> Anda. Menandai lunas akan memicu pembukaan akses materi/fulfillment dan notifikasi WhatsApp resmi kepada pembeli.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={isConfirmingPayment}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOrderToConfirm(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
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

      {/* ======================================================== */}
      {/* BULK IMPORT ORDERS MODAL (CSV/XLSX)                       */}
      {/* ======================================================== */}
      <BulkImportOrdersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tenantSlug={tenantSlug}
        onImportSuccess={() => fetchOrders()}
      />

      {/* ======================================================== */}
      {/* META CSV EXPORT SUMMARY MODAL (SKIP SUMMARY & AUDIT)      */}
      {/* ======================================================== */}
      <MetaCsvExportSummaryModal
        isOpen={isExportSummaryModalOpen}
        onClose={() => setIsExportSummaryModalOpen(false)}
        summary={metaExportSummary}
      />
    </div>
  );
}
