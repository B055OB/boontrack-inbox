'use client';

import React, { useState, useEffect, use } from 'react';
import { 
  CheckCircle2, 
  Printer, 
  Download, 
  ExternalLink, 
  Share2, 
  ArrowLeft, 
  Package, 
  Truck, 
  Sparkles, 
  Clock, 
  FileText, 
  Key, 
  Building2, 
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { 
  resolveFulfillmentRequirements, 
  normalizeBriefingUrl 
} from '@/lib/product-catalog';
import { formatWIBDateTime } from '@/lib/finance-engine';
import { printThermalShippingLabel } from '@/lib/utils/orderFulfillment';
import { getStorefrontShopUrl } from '@/lib/storefront-urls';

interface InvoicePageProps {
  params: Promise<{ tenant: string; orderId: string }>;
}

export default function UniversalInvoicePage({ params }: InvoicePageProps) {
  const resolvedParams = use(params);
  const tenantSlug = resolvedParams.tenant;
  const orderId = resolvedParams.orderId;

  const [order, setOrder] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    async function loadInvoiceData() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        if (supabase) {
          // 1. Fetch Order Data safely (supporting legacy string IDs e.g. ORD-179... and UUID PKs)
          let orderData: any = null;
          try {
            const { data: byId, error: idErr } = await supabase
              .from('orders')
              .select('*')
              .eq('id', orderId)
              .maybeSingle();
            if (byId && !idErr) orderData = byId;
          } catch {}

          if (!orderData) {
            // Fallback cari via id, order_number, atau correlation_id
            try {
              const { data: altOrder, error: altErr } = await supabase
                .from('orders')
                .select('*')
                .or(`id.eq.${orderId},order_number.eq.${orderId},correlation_id.eq.${orderId}`)
                .maybeSingle();
              if (altOrder && !altErr) orderData = altOrder;
            } catch {}
          }

          if (orderData) {
            setOrder(orderData);
            if (orderData.metadata?.auto_paid_at) {
              const diff = Math.max(0, Math.ceil((new Date(orderData.metadata.auto_paid_at).getTime() - Date.now()) / 1000));
              setRemainingSeconds(diff);
            } else if (orderData.metadata?.ocr_verified) {
              setRemainingSeconds(180);
            }
          }

          // 2. Fetch Tenant Profile Data
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('*')
            .eq('slug', tenantSlug)
            .maybeSingle();
          if (tenantData) setTenant(tenantData);
        }
      } catch (err) {
        console.warn('[Invoice] Error loading data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (orderId && tenantSlug) {
      loadInvoiceData();
    }
  }, [orderId, tenantSlug]);

  const isOrderWaitingVerif =
    (order?.status || order?.payment_status || '').toUpperCase() === 'WAITING_CONFIRMATION' ||
    (order?.status || order?.payment_status || '').toUpperCase() === 'WAITING_VERIFICATION';

  // 1-Second Interval Countdown untuk Timer Verifikasi Otomatis 3 Menit
  useEffect(() => {
    if (!isOrderWaitingVerif) return;

    const autoPaidAt = order?.metadata?.auto_paid_at;
    if (!autoPaidAt && !order?.metadata?.ocr_verified) return;

    const timer = setInterval(() => {
      if (autoPaidAt) {
        const diff = Math.max(0, Math.ceil((new Date(autoPaidAt).getTime() - Date.now()) / 1000));
        setRemainingSeconds(diff);
      } else {
        setRemainingSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOrderWaitingVerif, order?.metadata?.auto_paid_at, order?.metadata?.ocr_verified]);

  // Realtime polling status ke backend setiap 3 detik selama menunggu konfirmasi / verifikasi
  useEffect(() => {
    if (!orderId || !isOrderWaitingVerif) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const statusData = await res.json();
          if (statusData?.status === 'PAID') {
            setOrder((prev: any) => ({
              ...prev,
              ...statusData,
              status: 'PAID',
              payment_status: 'PAID',
              order_status: 'PAID',
            }));
            clearInterval(pollInterval);
          } else if (statusData?.auto_paid_at) {
            setOrder((prev: any) => ({
              ...prev,
              metadata: {
                ...(prev?.metadata || {}),
                auto_paid_at: statusData.auto_paid_at,
                ocr_verified: statusData.ocr_verified,
                verification_timer_seconds: statusData.verification_timer_seconds,
              },
            }));
            if (typeof statusData.verification_remaining_seconds === 'number') {
              setRemainingSeconds(statusData.verification_remaining_seconds);
            }
          }
        }
      } catch (err) {
        // silent polling catch
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [orderId, isOrderWaitingVerif]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleShare = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-semibold text-slate-300">Memuat lembar invoice resmi...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3 border border-rose-500/30">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-white">Invoice Tidak Ditemukan</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Pesanan dengan nomor #{orderId} tidak terdaftar pada toko ini atau telah diarsipkan.
        </p>
        <a
          href={getStorefrontShopUrl(tenantSlug)}
          className="mt-5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Beranda Toko</span>
        </a>
      </div>
    );
  }

  const isPaid = (order.status || order.payment_status || '').toUpperCase() === 'PAID';
  const isWaitingVerif = (order.status || order.payment_status || '').toUpperCase() === 'WAITING_CONFIRMATION';
  const rawProductType = (order.product_type || (order.shipping_address ? 'PHYSICAL' : 'DIGITAL')).toUpperCase();
  const isPhysical = rawProductType === 'PHYSICAL' || rawProductType === 'FOOD' || rawProductType === 'FISIK';
  const isDigitalOrService = rawProductType === 'DIGITAL' || rawProductType === 'SERVICE' || rawProductType === 'FIELD_SERVICE' || rawProductType === 'AGENCY';
  const isPickup =
    order.fulfillment_type === 'PICKUP' ||
    order.metadata?.fulfillment_type === 'PICKUP' ||
    String(order.shipping_courier || '').toLowerCase().includes('pickup') ||
    String(order.shipping_courier || '').toLowerCase().includes('ambil sendiri');
  const pickupData = order.pickup_info || order.metadata?.pickup_info || null;
  const shouldShowShippingLabel = isPhysical && !isDigitalOrService && !isPickup;

  const totalAmount = Number(order.gross_amount || order.total_amount || 0);
  const storeName = tenant?.name || tenant?.metadata?.store_name || tenantSlug;
  const storePhone = tenant?.metadata?.whatsapp_number || tenant?.metadata?.phone || tenant?.phone || '';
  const storeAddress = tenant?.metadata?.store_address || tenant?.metadata?.address || '';

  const digitalAccessUrl =
    order.briefing_url ||
    order.customer_briefing?.briefing_url ||
    order.fulfillment_metadata?.access_url ||
    order.download_url ||
    order.link_digital ||
    order.delivery_url ||
    '';

  const licenseKey = order.fulfillment_metadata?.license_key;
  const instructions = order.fulfillment_metadata?.instructions;

  return (
    <div className="min-h-screen bg-slate-100 py-6 sm:py-10 px-4 print:bg-white print:p-0 text-slate-900 font-sans">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Navigation & Action Bar (Hidden during Print) */}
        <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
          <a
            href={getStorefrontShopUrl(tenantSlug)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Kembali ke Toko {storeName}</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{copiedLink ? 'Link Tersalin!' : 'Bagikan'}</span>
            </button>

            {shouldShowShippingLabel && (
              <button
                type="button"
                onClick={() => {
                  printThermalShippingLabel(
                    {
                      id: order.id,
                      invoice_no: order.id,
                      customer_name: order.customer_name,
                      customer_phone: order.customer_phone,
                      shipping_address: order.shipping_address,
                      shipping_courier: order.shipping_courier,
                      total_amount: totalAmount,
                      items_summary: order.product_title,
                      payment_method: order.payment_method,
                      payment_status: order.payment_status || order.status,
                      created_at: order.created_at,
                    },
                    {
                      name: storeName,
                      phone: storePhone,
                      city: storeAddress,
                    }
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-amber-600" />
                <span>Cetak Resi Pengiriman</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/20 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
        </div>

        {/* INVOICE CARD */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden print:shadow-none print:border-none print:rounded-none">
          {/* Header Banner */}
          <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200 inline-block mb-1">
                  Bukti Transaksi Resmi
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">{storeName}</h1>
                {storeAddress && <p className="text-xs text-slate-500 mt-0.5">{storeAddress}</p>}
                {storePhone && <p className="text-xs text-slate-500 font-mono">WhatsApp: {storePhone}</p>}
              </div>

              <div className="sm:text-right space-y-1">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-black border ${
                    isPaid
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : isWaitingVerif
                      ? 'bg-purple-50 text-purple-700 border-purple-300 font-extrabold'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  {isPaid
                    ? 'LUNAS (PAID)'
                    : isWaitingVerif
                    ? 'MENUNGGU VERIFIKASI SELLER'
                    : 'MENUNGGU PEMBAYARAN'}
                </span>
                <div className="font-mono text-xs font-bold text-slate-800">
                  No. Faktur: <span className="text-slate-950">#{order.id}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatWIBDateTime(order.created_at || new Date().toISOString())}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Customer & Shipping Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Informasi Pembeli:
                </span>
                <div className="font-bold text-slate-900 text-sm">
                  {order.customer_name || 'Pelanggan Toko'}
                </div>
                <div className="font-mono text-slate-600">{order.customer_phone || '-'}</div>
                {order.customer_email && (
                  <div className="text-slate-500 font-mono">{order.customer_email}</div>
                )}
              </div>

              {isPickup ? (
                <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                    Metode Serah Terima:
                  </span>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1 text-emerald-800">
                    <span>🏬 Ambil Sendiri di Toko (Self-Pickup)</span>
                  </div>
                  <p className="text-slate-700 leading-snug">
                    {pickupData?.address || storeAddress || 'Toko Utama'}
                  </p>
                  {pickupData?.mapsUrl && (
                    <a
                      href={pickupData.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold text-[11px] mt-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Petunjuk Arah (Google Maps)</span>
                    </a>
                  )}
                  {pickupData?.instructions && (
                    <div className="text-[11px] text-slate-500 mt-1 italic">
                      ⏰ {pickupData.instructions}
                    </div>
                  )}
                </div>
              ) : order.shipping_address ? (
                <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Alamat Pengiriman (Fisik):
                  </span>
                  <p className="text-slate-700 leading-snug">{order.shipping_address}</p>
                  {order.shipping_courier && (
                    <div className="text-[11px] font-semibold text-amber-800 mt-1">
                      Kurir: {order.shipping_courier}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Rincian Produk & Tagihan */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="py-2.5 px-4">Deskripsi Produk &amp; Layanan</th>
                    <th className="py-2.5 px-4 text-center">Tipe</th>
                    <th className="py-2.5 px-4 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {order.product_title || 'Pesanan Produk'}
                      </div>
                      <div className="text-[11px] text-slate-500">ID Produk: {order.product_id}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {rawProductType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-black font-mono text-slate-900">
                      Rp {totalAmount.toLocaleString('id-ID')}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Total Summary */}
              <div className="bg-slate-50/60 p-4 border-t border-slate-200 flex flex-col items-end gap-1.5 text-xs">
                <div className="flex justify-between w-64 text-slate-500">
                  <span>Metode Pembayaran:</span>
                  <span className="font-semibold text-slate-800 uppercase">
                    {order.payment_method || 'QRIS / Transfer Bank'}
                  </span>
                </div>
                <div className="flex justify-between w-64 text-slate-500">
                  <span>Status Pembayaran:</span>
                  <span className="font-bold text-slate-800">
                    {isPaid ? 'LUNAS (100%)' : isWaitingVerif ? 'Verifikasi Seller' : 'Belum Bayar'}
                  </span>
                </div>
                <div className="flex justify-between w-64 pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
                  <span>Total Tagihan:</span>
                  <span className="text-emerald-700 font-mono">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            {/* FULFILLMENT: SELF-PICKUP INSTRUCTIONS */}
            {isPaid && isPickup && (
              <div className="bg-emerald-50/90 border-2 border-emerald-500/70 rounded-2xl p-5 space-y-3.5 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Pesanan Siap Diambil di Toko (Self-Pickup)
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      Pembayaran telah lunas. Silakan datangi alamat toko berikut untuk mengambil pesanan Anda.
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-emerald-200 text-xs space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Nama Toko / Merchant:
                    </span>
                    <p className="font-bold text-slate-900 text-sm">{storeName}</p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Lokasi Toko:
                    </span>
                    <p className="text-slate-800 font-medium leading-relaxed">
                      {pickupData?.address || storeAddress || 'Toko Utama'}
                    </p>
                  </div>

                  {pickupData?.instructions && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                        Instruksi &amp; Jam Operasional:
                      </span>
                      <p className="text-amber-950 font-medium mt-0.5 whitespace-pre-line">
                        {pickupData.instructions}
                      </p>
                    </div>
                  )}

                  {pickupData?.mapsUrl && (
                    <div className="pt-1">
                      <a
                        href={pickupData.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Petunjuk Arah (Google Maps)</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* FULFILLMENT & DIGITAL ACCESS BOX (Muncul Saat Status Lunas & Bukan Pickup) */}
            {isPaid && !isPickup && (
              <div className="bg-emerald-50/70 border-2 border-emerald-500/70 rounded-2xl p-5 space-y-3.5 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Akses Layanan &amp; Pengiriman Digital Resmi
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Tautan akses materi atau pengumpulan brief kampanye Anda telah aktif.
                    </p>
                  </div>
                </div>

                {digitalAccessUrl ? (
                  <div className="pt-1 flex flex-col sm:flex-row gap-2">
                    <a
                      href={normalizeBriefingUrl(digitalAccessUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-md shadow-emerald-600/25"
                    >
                      <Download className="w-4 h-4" />
                      <span>Buka Akses / Unduh Materi Sekarang</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {order.briefing_url && (
                      <a
                        href={normalizeBriefingUrl(order.briefing_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-md"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Buka Briefing Klien (External Link ↗)</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-white border border-emerald-200 rounded-xl text-xs text-slate-700">
                    Akses materi sedang dipersiapkan oleh tim toko. Konfirmasi instruksi lengkap juga dikirimkan ke WhatsApp Anda.
                  </div>
                )}

                {licenseKey && (
                  <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Kunci Lisensi Pembeli:
                    </span>
                    <div className="font-mono font-bold text-blue-700 text-sm select-all">
                      {licenseKey}
                    </div>
                  </div>
                )}

                {instructions && (
                  <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-1 text-xs text-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Petunjuk Tambahan:
                    </span>
                    <p className="whitespace-pre-line leading-relaxed">{instructions}</p>
                  </div>
                )}
              </div>
            )}

            {/* WAITING CONFIRMATION & ESTIMATED 3-MINUTE VERIFICATION UX */}
            {isWaitingVerif && (
              <div className="bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 border-2 border-purple-500/80 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl shadow-purple-950/40 text-white animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 border border-purple-400/40 shadow-inner">
                      <Clock className="w-6 h-6 text-purple-400 animate-spin" style={{ animationDuration: '6s' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 bg-purple-950/90 px-2.5 py-0.5 rounded-full border border-purple-600/60 inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Status: MATCH_CANDIDATE</span>
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-black text-white mt-1">
                        Bukti Pembayaran Sedang Diverifikasi
                      </h3>
                    </div>
                  </div>

                  {/* Countdown Badge */}
                  <div className="flex items-center gap-2 bg-slate-950/80 px-4 py-2 rounded-2xl border border-purple-500/40 self-start sm:self-center">
                    <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                      Estimasi Verifikasi:
                    </span>
                    <span className="font-mono text-base font-black text-amber-400 tracking-wider">
                      {String(Math.floor((remainingSeconds ?? 180) / 60)).padStart(2, '0')}:
                      {String((remainingSeconds ?? 180) % 60).padStart(2, '0')}
                    </span>
                  </div>
                </div>

                {/* Sinyal Checklist Visual (CTO Mandate) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span className="text-slate-200">Nominal Transfer: <strong>Rp {totalAmount.toLocaleString('id-ID')}</strong> (Cocok)</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span className="text-slate-200">Merchant Tujuan: <strong>{storeName}</strong> (Terverifikasi)</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span className="text-slate-200">Bukti Struk: <strong>MATCH_CANDIDATE</strong></span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-amber-500/30">
                    <span className="text-amber-400 font-bold animate-pulse">⏳</span>
                    <span className="text-slate-200">Konfirmasi Mutasi Bank: <strong>Menunggu Sinyal</strong></span>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-purple-500/30 rounded-2xl p-4 space-y-2 text-xs text-slate-300">
                  <p className="leading-relaxed">
                    Bukti pembayaran sedang diverifikasi. Jika verifikasi otomatis belum dapat memastikan pembayaran, pesanan akan diteruskan ke pemeriksaan manual toko.
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-purple-300 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
                    <span>Sistem memeriksa mutasi secara realtime. Faktur akan diperbarui begitu dana terkonfirmasi.</span>
                  </div>
                </div>

                {order?.payment_proof_url && (
                  <div className="pt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>Lampiran: Bukti Transfer Terkirim</span>
                    <a
                      href={order.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-300 hover:text-purple-200 font-bold underline inline-flex items-center gap-1"
                    >
                      <span>Lihat Bukti Foto</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Card */}
          <div className="p-6 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400 space-y-3">
            <div className="flex justify-center print:hidden">
              <a
                href={getStorefrontShopUrl(tenantSlug)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition shadow-xs"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
                <span>Kembali ke Beranda Toko ({storeName})</span>
              </a>
            </div>
            <div>
              <p>Terima kasih atas kepercayaan Anda bertransaksi dengan {storeName}.</p>
              <p className="text-[10px] text-slate-400">
                Dokumen ini merupakan bukti transaksi yang sah dari sistem multi-tenant BoonTrack.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
