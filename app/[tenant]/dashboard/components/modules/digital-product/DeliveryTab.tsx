'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Download, CheckCircle2, RefreshCw, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export interface DigitalDeliveryItem {
  id: string;
  orderId: string;
  customerName: string;
  email: string;
  phone: string;
  productName: string;
  deliveredAt: string;
  downloadCount: number;
  deliveryStatus: 'DELIVERED' | 'FAILED' | 'PENDING';
  downloadUrl: string;
}

export default function DigitalDeliveryTab({ tenantSlug }: { tenantSlug: string }) {
  const [deliveries, setDeliveries] = useState<DigitalDeliveryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDeliveries = useCallback(async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();
      if (!supabase) {
        setDeliveries([]);
        return;
      }

      // 1. Ambil data tenant untuk mendapatkan ID jika diperlukan
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, slug')
        .eq('slug', tenantSlug)
        .maybeSingle();

      const tenantId = tenantRow?.id;

      // 2. Query riwayat pesanan nyata dari tabel orders
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (tenantId) {
        query = query.or(`tenant_slug.eq.${tenantSlug},tenant_id.eq.${tenantId}`);
      } else {
        query = query.eq('tenant_slug', tenantSlug);
      }

      const { data: rawOrders, error } = await query;
      if (error) {
        console.warn('[DigitalDeliveryTab] Gagal memuat pesanan:', error.message);
        setDeliveries([]);
        return;
      }

      if (!Array.isArray(rawOrders) || rawOrders.length === 0) {
        setDeliveries([]);
        return;
      }

      // 3. Filter khusus transaksi yang melibatkan produk digital
      const digitalOrders = rawOrders.filter((o: any) => {
        const pt = String(o.product_type || '').toUpperCase();
        if (pt.includes('DIGITAL')) return true;
        if (o.fulfillment_metadata?.access_url || o.fulfillment_metadata?.download_url) return true;
        if (o.download_url || o.delivery_url) return true;
        // Jika tidak memerlukan kurir pengiriman fisik & bukan servis lapangan
        if (!o.shipping_address && !o.shipping_courier && !pt.includes('PHYSICAL') && !pt.includes('SERVICE')) {
          return true;
        }
        return false;
      });

      const mappedList: DigitalDeliveryItem[] = digitalOrders.map((o: any, idx: number) => {
        const rawStatus = String(o.status || o.payment_status || '').toUpperCase();
        const isPaid = ['PAID', 'LUNAS', 'SETTLEMENT', 'SUCCESS', 'COMPLETED'].includes(rawStatus);
        const isFailed = ['FAILED', 'EXPIRED', 'CANCELLED', 'BATAL'].includes(rawStatus);

        const downloadUrl =
          o.fulfillment_metadata?.download_url ||
          o.fulfillment_metadata?.access_url ||
          o.download_url ||
          o.delivery_url ||
          (o.id ? `https://boontrack.com/d/${o.id}` : '#');

        const downloadCount = Number(
          o.fulfillment_metadata?.download_count ??
          o.metadata?.download_count ??
          (isPaid ? 1 : 0)
        );

        const dateStr = o.paid_at || o.created_at;
        const formattedDate = dateStr
          ? new Date(dateStr).toLocaleString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }) + ' WIB'
          : '-';

        return {
          id: String(o.id || `DEL-${idx + 1}`),
          orderId: String(o.invoice_no || o.order_id || o.id || `ORD-${idx + 1}`),
          customerName: o.customer_name || 'Pelanggan',
          email: o.customer_email || '-',
          phone: o.customer_phone || '-',
          productName: o.product_title || o.product_name || o.items_summary || 'Produk Digital',
          deliveredAt: formattedDate,
          downloadCount,
          deliveryStatus: isPaid ? 'DELIVERED' : isFailed ? 'FAILED' : 'PENDING',
          downloadUrl,
        };
      });

      setDeliveries(mappedList);
    } catch (err) {
      console.error('[DigitalDeliveryTab] Error fetching digital delivery logs:', err);
      setDeliveries([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Log Distribusi Produk Digital &amp; Lisensi
            </h2>
            <p className="text-xs text-slate-500">
              Riwayat pengiriman otomatis tautan akses file, kode lisensi, dan log download pasca transaksi lunas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchDeliveries()}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer disabled:opacity-50"
            title="Segarkan data log"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sistem Distribusi Otomatis 24/7 Aktif</span>
          </span>
        </div>
      </div>

      {/* LOADING STATE */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <p className="text-xs font-semibold text-slate-500">
            Memuat riwayat distribusi produk digital...
          </p>
        </div>
      ) : deliveries.length === 0 ? (
        /* EMPTY STATE RESMI (SESUAI SPESIFIKASI) */
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-14 text-center shadow-xs flex flex-col items-center justify-center max-w-xl mx-auto space-y-4 my-6">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-2xs">
            <Download className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-base font-black text-slate-900">
              Belum Ada Pengiriman Produk Digital
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Belum ada pengiriman produk digital. Riwayat pengiriman otomatis file dan lisensi pelanggan akan muncul di sini setelah transaksi selesai.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchDeliveries()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan Log</span>
          </button>
        </div>
      ) : (
        /* TABEL LOG DISTRIBUSI NYATA */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Order &amp; Pembeli</th>
                  <th className="py-3 px-4">Produk Digital</th>
                  <th className="py-3 px-4">Waktu Pengiriman</th>
                  <th className="py-3 px-4 text-center">Unduhan</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{item.customerName}</div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                        <span>{item.orderId}</span>
                        <span>•</span>
                        <span>{item.phone}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{item.productName}</div>
                      <div className="text-[10px] text-indigo-600 font-mono truncate max-w-[200px]">
                        {item.downloadUrl}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {item.deliveredAt}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px]">
                        {item.downloadCount}x klik
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {item.deliveryStatus === 'DELIVERED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          TERKIRIM
                        </span>
                      ) : item.deliveryStatus === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          MENUNGGU
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          GAGAL
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {item.phone && item.phone !== '-' ? (
                        <a
                          href={`https://wa.me/${item.phone.replace(/^\+/, '').replace(/^0/, '62')}?text=${encodeURIComponent(
                            `Halo ${item.customerName}, berikut link akses digital pesanan ${item.productName} Anda: ${item.downloadUrl}. Terima kasih telah membeli di ${tenantSlug}!`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                        >
                          <span>Kirim Ulang WA</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
