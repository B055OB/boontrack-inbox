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
import { getSupabase } from '@/lib/supabaseClient';
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

  useEffect(() => {
    async function loadInvoiceData() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        if (supabase) {
          // 1. Fetch Order Data
          const { data: orderData } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

          if (orderData) {
            setOrder(orderData);
          } else {
            // Fallback cari via correlation_id atau invoice query
            const { data: altOrder } = await supabase
              .from('orders')
              .select('*')
              .or(`id.eq.${orderId},correlation_id.eq.${orderId}`)
              .maybeSingle();
            if (altOrder) setOrder(altOrder);
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
  const shouldShowShippingLabel = isPhysical && !isDigitalOrService;

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

              {order.shipping_address && (
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
              )}
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

            {/* FULFILLMENT & DIGITAL ACCESS BOX (Muncul Saat Status Lunas) */}
            {isPaid && (
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

            {/* WAITING CONFIRMATION BADGE */}
            {isWaitingVerif && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-center gap-3 text-xs text-purple-900">
                <Clock className="w-5 h-5 text-purple-600 shrink-0 animate-pulse" />
                <div>
                  <span className="font-bold block">Bukti Transfer Berhasil Diunggah</span>
                  <p className="text-[11px] text-purple-700">
                    Seller sedang memverifikasi mutasi bank Anda. Status faktur akan otomatis beralih ke LUNAS segera setelah diverifikasi.
                  </p>
                </div>
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
