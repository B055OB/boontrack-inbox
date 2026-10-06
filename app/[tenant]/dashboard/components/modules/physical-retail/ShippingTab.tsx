'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Truck, PackageCheck, CheckCircle2, ArrowRight, ExternalLink, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export interface ShipmentItem {
  id: string;
  orderId: string;
  recipientName: string;
  phone: string;
  destination: string;
  courier: string;
  waybill: string;
  status: 'PENDING_PICKUP' | 'SHIPPED' | 'DELIVERED';
  shippedAt: string;
}

export default function PhysicalRetailShippingTab({ tenantSlug }: { tenantSlug: string }) {
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inputOrderId, setInputOrderId] = useState('');
  const [inputResi, setInputResi] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchShipments = useCallback(async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();
      if (!supabase) {
        setShipments([]);
        return;
      }

      // 1. Ambil ID tenant
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, slug')
        .eq('slug', tenantSlug)
        .maybeSingle();

      const tenantId = tenantRow?.id;

      // 2. Query orders nyata dari Supabase
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
        console.warn('[PhysicalRetailShippingTab] Gagal memuat pengiriman:', error.message);
        setShipments([]);
        return;
      }

      if (!Array.isArray(rawOrders) || rawOrders.length === 0) {
        setShipments([]);
        return;
      }

      // 3. Filter transaksi produk fisik atau pesanan yang membutuhkan pengiriman
      const physicalOrders = rawOrders.filter((o: any) => {
        const pt = String(o.product_type || '').toUpperCase();
        if (pt.includes('PHYSICAL') || pt.includes('RETAIL') || pt.includes('FNB') || pt.includes('FOOD')) {
          return true;
        }
        if (o.shipping_address || o.shipping_courier || o.tracking_number || o.waybill) {
          return true;
        }
        // Jika tidak memiliki akses url unduhan digital & bukan booking konsultasi
        if (!o.fulfillment_metadata?.access_url && !o.fulfillment_metadata?.meeting_url && !o.download_url && !pt.includes('DIGITAL') && !pt.includes('SERVICE')) {
          return true;
        }
        return false;
      });

      const mapped: ShipmentItem[] = physicalOrders.map((o: any, idx: number) => {
        const waybill = String(
          o.tracking_number ||
          o.waybill ||
          o.airwaybill ||
          o.fulfillment_metadata?.waybill ||
          o.fulfillment_metadata?.tracking_number ||
          ''
        ).trim();

        const rawStatus = String(o.shipping_status || o.status || '').toUpperCase();
        const isDelivered = rawStatus === 'DELIVERED' || rawStatus === 'SELESAI';
        const isShipped = isDelivered || Boolean(waybill) || rawStatus === 'SHIPPED';

        const dateStr = o.shipped_at || o.paid_at || o.created_at;
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
          id: String(o.id || `SHP-${idx + 1}`),
          orderId: String(o.invoice_no || o.order_id || o.id || `ORD-${idx + 1}`),
          recipientName: o.customer_name || 'Pembeli',
          phone: o.customer_phone || '-',
          destination: o.shipping_address || 'Alamat tidak tertera',
          courier: o.shipping_courier || o.courier_name || 'Kurir Reguler',
          waybill,
          status: isDelivered ? 'DELIVERED' : isShipped ? 'SHIPPED' : 'PENDING_PICKUP',
          shippedAt: formattedDate,
        };
      });

      setShipments(mapped);
    } catch (err) {
      console.error('[PhysicalRetailShippingTab] Error fetching shipments:', err);
      setShipments([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const handleUpdateResi = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOrderId = inputOrderId.trim();
    const cleanResi = inputResi.trim();

    if (!cleanOrderId || !cleanResi) {
      setFeedback({ type: 'error', text: 'Nomor Order dan Nomor Resi wajib diisi.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const supabase = getSupabase();
      if (supabase) {
        // Cari order berdasarkan id atau invoice_no
        const targetShipment = shipments.find(
          (s) =>
            s.orderId.toLowerCase() === cleanOrderId.toLowerCase() ||
            s.id.toLowerCase() === cleanOrderId.toLowerCase()
        );

        const targetId = targetShipment?.id || cleanOrderId;

        const { error: updateErr } = await supabase
          .from('orders')
          .update({
            tracking_number: cleanResi,
            shipping_status: 'SHIPPED',
            status: 'SHIPPED',
          })
          .or(`id.eq.${targetId},invoice_no.eq.${cleanOrderId}`);

        if (updateErr) {
          console.warn('[PhysicalRetailShippingTab] Update order error:', updateErr.message);
        }
      }

      // Update state lokal seketika
      setShipments((prev) =>
        prev.map((s) => {
          if (
            s.orderId.toLowerCase() === cleanOrderId.toLowerCase() ||
            s.id.toLowerCase() === cleanOrderId.toLowerCase()
          ) {
            return { ...s, waybill: cleanResi, status: 'SHIPPED' };
          }
          return s;
        })
      );

      setFeedback({ type: 'success', text: `Nomor resi ${cleanResi} berhasil disimpan!` });
      setInputOrderId('');
      setInputResi('');
    } catch (err) {
      console.error('[PhysicalRetailShippingTab] Error updating resi:', err);
      setFeedback({ type: 'error', text: 'Gagal menyimpan resi. Coba lagi.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Logistik Ekspedisi &amp; Input Resi Pengiriman
            </h2>
            <p className="text-xs text-slate-500">
              Kelola nomor resi paket fisik kurir reguler/kargo dan pantau pelacakan pesanan pembeli.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchShipments()}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer disabled:opacity-50"
            title="Segarkan data pengiriman"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
          <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Multi-Kurir Terintegrasi</span>
          </span>
        </div>
      </div>

      {/* Form Input Resi Cepat */}
      <form onSubmit={handleUpdateResi} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-900">Input / Update Nomor Resi Cepat</h4>
          {feedback && (
            <span className={`text-[11px] font-bold flex items-center gap-1 ${feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {feedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{feedback.text}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <input
            type="text"
            placeholder="No. Order / Invoice (e.g. ORD-...)"
            value={inputOrderId}
            onChange={(e) => setInputOrderId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <input
            type="text"
            placeholder="Nomor Resi (Waybill)"
            value={inputResi}
            onChange={(e) => setInputResi(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Resi'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* LOADING STATE */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
          <p className="text-xs font-semibold text-slate-500">
            Memuat riwayat pengiriman produk fisik...
          </p>
        </div>
      ) : shipments.length === 0 ? (
        /* CLEAN EMPTY STATE (SESUAI ATURAN ZERO MOCKUP) */
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-14 text-center shadow-xs flex flex-col items-center justify-center max-w-xl mx-auto space-y-4 my-6">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shadow-2xs">
            <Truck className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-base font-black text-slate-900">
              Belum Ada Data Pengiriman
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Belum ada data pengiriman. Pesanan produk fisik yang masuk akan tampil di sini untuk pemantauan dan input nomor resi ekspedisi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchShipments()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan Data</span>
          </button>
        </div>
      ) : (
        /* SHIPMENT TABLE REAL DATA */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Order &amp; Penerima</th>
                  <th className="py-3 px-4">Tujuan Pengiriman</th>
                  <th className="py-3 px-4">Kurir &amp; No. Resi</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Lacak Resi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{s.recipientName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{s.orderId} • {s.phone}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {s.destination}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{s.courier}</div>
                      {s.waybill ? (
                        <div className="font-mono text-amber-700 font-bold text-[11px]">{s.waybill}</div>
                      ) : (
                        <div className="text-slate-400 text-[11px] italic">Belum ada resi</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {s.status === 'DELIVERED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          TERKIRIM
                        </span>
                      ) : s.status === 'SHIPPED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                          DALAM PENGIRIMAN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          MENUNGGU RESI
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {s.waybill ? (
                        <a
                          href={`https://cekresi.com/?noresi=${encodeURIComponent(s.waybill)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline"
                        >
                          <span>Cek Posisi</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setInputOrderId(s.orderId);
                          }}
                          className="text-amber-600 font-bold text-[11px] hover:underline cursor-pointer"
                        >
                          + Input Resi
                        </button>
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
