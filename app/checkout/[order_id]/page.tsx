'use client';

import React, { useState, useEffect, use } from 'react';
import { 
  Clock, 
  MessageSquare, 
  ShieldCheck, 
  CheckCircle2, 
  QrCode, 
  Building2, 
  Copy, 
  Check, 
  ExternalLink, 
  AlertTriangle,
  Truck,
  Zap,
  Sparkles,
  Key,
  FileText,
  Download
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { getBackendApiUrl } from '@/lib/api-config';
import { trackClientPurchase, initMetaPixel, initTikTokPixel } from '@/lib/tracking';
import { generateDynamicQRIS, INTERNAL_TENANTS } from '@/lib/qris-dynamic';
import { getTenantWhatsApp, getPlatformWhatsApp } from '@/lib/tenant-config';
import { resolveFulfillmentRequirements } from '@/lib/product-catalog';

const STATIC_QRIS = process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS || "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1";

interface Props {
  params: Promise<{ order_id: string }>;
}

export default function CheckoutPage({ params }: Props) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.order_id;

  const [timeLeft, setTimeLeft] = useState(900); // 15 menit
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrder() {
      setLoading(true);
      try {
        // 1. Coba baca dari backup lokal
        if (typeof window !== 'undefined') {
          const localOrderStr = localStorage.getItem(`bt_order_${orderId}`);
          if (localOrderStr) {
            try {
              const parsed = JSON.parse(localOrderStr);
              if (parsed?.id) {
                setOrder(parsed);
                setLoading(false);
                return;
              }
            } catch {}
          }
        }

        const supabase = getSupabase();
        if (supabase) {
          // 2. Coba baca dari tabel orders
          const { data: dbOrder } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

          if (dbOrder) {
            setOrder(dbOrder);
            setLoading(false);
            return;
          }

          // 2. Coba baca dari tabel product_orders
          const { data: pOrder } = await supabase
            .from('product_orders')
            .select('*')
            .eq('order_id', orderId)
            .maybeSingle();

          if (pOrder) {
            setOrder({
              id: pOrder.order_id,
              product_title: pOrder.product_name,
              gross_amount: pOrder.gross_amount,
              base_price: pOrder.base_price,
              admin_fee: pOrder.admin_fee,
              unique_code: pOrder.unique_code,
              payment_method: pOrder.payment_method,
              customer_name: pOrder.customer_name,
              customer_phone: pOrder.customer_phone,
              customer_email: pOrder.customer_email,
              status: pOrder.status,
              shipping_cost: pOrder.shipping_cost,
              shipping_subsidy: pOrder.shipping_subsidy,
              shipping_courier: pOrder.shipping_courier,
              shipping_address: pOrder.shipping_address
            });
            setLoading(false);
            return;
          }
        }

        // 3. Fallback fetch dari API backend
        const res = await fetch(getBackendApiUrl(`/api/v1/orders/${orderId}`));
        if (res.ok) {
          const data = await res.json();
          setOrder(data);
        }
      } catch (err) {
        console.warn('[Checkout Page] Failed to fetch order:', err);
      } finally {
        setLoading(false);
      }
    }

    loadOrder();

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [orderId]);

  // Request dynamic QRIS jika belum ada qr_code_url
  useEffect(() => {
    async function ensureDynamicQris() {
      if (!order || order.payment_method === 'manual_transfer' || order.qr_code_url) return;

      try {
        const gross = Number(order.gross_amount || order.total_amount || order.amount || 0);
        const res = await fetch('/api/v1/payments/qris/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            external_id: orderId,
            amount: gross,
            tenant_slug: order.tenant_slug || 'onlineboost',
            customer_phone: order.customer_phone,
            customer_name: order.customer_name,
            product_name: order.product_title
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.qr_code_url || data.qr_string) {
            setOrder((prev: any) => ({
              ...prev,
              qr_code_url: data.qr_code_url || (data.qr_string ? `https://quickchart.io/qr?text=${encodeURIComponent(data.qr_string)}&size=300&ecLevel=H` : prev.qr_code_url),
              qr_string: data.qr_string || prev.qr_string
            }));
          }
        }
      } catch (qErr) {
        console.warn('[Checkout Page] Dynamic QRIS fetch note:', qErr);
      }
    }

    ensureDynamicQris();
  }, [order, orderId]);

  // Trigger Purchase (Meta) & CompletePayment (TikTok) dengan deduplikasi event_id
  const [hasTrackedPurchase, setHasTrackedPurchase] = useState(false);
  useEffect(() => {
    if (order && !hasTrackedPurchase) {
      const gross = Number(order.gross_amount || order.total_amount || order.amount || 0);
      const title = order.product_title || order.product_name || 'Checkout Order';

      // Pastikan Pixel Terinisialisasi
      initMetaPixel('123456789012345');
      initTikTokPixel('C1234567890ABCDE');

      trackClientPurchase(orderId, gross, title);
      setHasTrackedPurchase(true);
    }
  }, [order, orderId, hasTrackedPurchase]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const isManual = order?.payment_method === 'manual_transfer' || order?.payment_method === 'manual';
  const grossAmount = Number(order?.gross_amount || order?.total_amount || order?.amount || 99000);
  const uniqueCode = Number(order?.unique_code || 0);
  const adminFee = 0;
  const productDiscount = Number(order?.product_discount || order?.discount_amount || 0);
  const voucherCode = order?.voucher_code || order?.coupon_code || '';
  const basePrice = Number(order?.base_price || (order?.net_product_price ? (order.net_product_price + productDiscount) : grossAmount - uniqueCode));
  const netProductPrice = Number(order?.net_product_price || Math.max(0, basePrice - productDiscount));
  const shippingCost = Number(order?.shipping_cost || 0);
  const shippingSubsidy = Number(order?.shipping_subsidy || 0);
  const netShippingCost = Number(order?.net_shipping_cost || Math.max(0, shippingCost - shippingSubsidy));

  const orderProductType = order?.product_type || (order?.shipping_address ? 'PHYSICAL' : 'DIGITAL');
  const orderRequirements = resolveFulfillmentRequirements(orderProductType);
  const isPaidOrder = order?.status === 'PAID' || order?.status === 'COMPLETED' || order?.status === 'SUCCESS' || order?.status === 'SETTLED';

  const fallbackQrisString = STATIC_QRIS;
  const tenantSlug = (order?.tenant_slug || order?.tenant_id || '').toLowerCase();
  const isInternalTenant = INTERNAL_TENANTS.includes(tenantSlug);
  // For internal tenants: generate dynamic QRIS with amount embedded
  // For external merchants: use their own qr_string from backend as-is
  const rawQrisValue = isInternalTenant
    ? generateDynamicQRIS(order?.qr_string || fallbackQrisString, grossAmount)
    : (order?.qr_string || fallbackQrisString);
  const targetWaNumber = getTenantWhatsApp(tenantSlug) || getPlatformWhatsApp();
  const waConfirmUrl = `https://wa.me/${targetWaNumber}?text=${encodeURIComponent(
    `Halo Tim BoonTrack, saya sudah melakukan pembayaran untuk:\n\nOrder ID: ${orderId}\nProduk: ${order?.product_title || 'Produk Digital'}\nNama: ${order?.customer_name || '-'}\nTotal Nominal: Rp ${grossAmount.toLocaleString('id-ID')}\nMetode: ${isManual ? 'Transfer Bank Manual' : 'QRIS Dinamis'}\n\nMohon dicek dan aktivasi akses saya. Terima kasih!`
  )}`;

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        
        {/* Header Order */}
        <div className="text-center space-y-1">
          {isPaidOrder ? (
            <span className="text-xs uppercase tracking-wider font-bold text-emerald-400 bg-emerald-950/80 px-3.5 py-1 rounded-full border border-emerald-800/60 inline-flex items-center gap-1.5 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pembayaran Telah Terverifikasi (LUNAS)</span>
            </span>
          ) : isManual ? (
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-400 bg-blue-950/60 px-3 py-1 rounded-full border border-blue-800/40 inline-flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>Menunggu Transfer Bank Manual (Bebas Biaya Admin)</span>
            </span>
          ) : (
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/40 inline-flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" />
              <span>Menunggu Pembayaran QRIS (Bebas Biaya Admin)</span>
            </span>
          )}
          <h1 className="text-xl font-bold pt-2 text-white">
            {order?.product_title || 'Pembayaran Pesanan'}
          </h1>
          <p className="text-xs text-slate-400 font-mono">Order ID: {orderId}</p>
        </div>

        {/* Timer Bar (Hanya jika belum bayar) */}
        {!isPaidOrder && (
          <div className="flex items-center justify-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl py-2.5 text-amber-400 font-mono text-sm font-semibold">
            <Clock className="w-4 h-4" />
            <span>Sisa Waktu Pembayaran: {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
          </div>
        )}

        {/* Kartu Akses Delivery Payload Jika Status Lunas (PAID) */}
        {isPaidOrder && (orderRequirements.requiresDeliveryPayload || order?.fulfillment_metadata) && (
          <div className="bg-emerald-950/50 border-2 border-emerald-500/60 rounded-2xl p-5 space-y-4 shadow-xl text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 font-bold">
                <CheckCircle2 className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded-full uppercase border border-emerald-800/60">
                  Akses Produk Aktif
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Pengiriman &amp; Akses Layanan Anda
                </h3>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Metode Akses:</span>
                <span className="font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/60 text-[11px]">
                  {order?.fulfillment_metadata?.delivery_type === 'DOWNLOAD_LINK'
                    ? '📥 Link Download Instan'
                    : order?.fulfillment_metadata?.delivery_type === 'LICENSE_KEY'
                    ? '🔑 Lisensi / Kode Akses'
                    : '📋 Form Brief Klien'}
                </span>
              </div>

              {order?.fulfillment_metadata?.license_key && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-blue-400" />
                    <span>Kunci Lisensi / Akses:</span>
                  </span>
                  <div className="font-mono text-sm font-bold text-blue-400 select-all bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                    {order.fulfillment_metadata.license_key}
                  </div>
                </div>
              )}

              {order?.fulfillment_metadata?.instructions && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Petunjuk Penggunaan:</span>
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    {order.fulfillment_metadata.instructions}
                  </p>
                </div>
              )}

              {(order?.fulfillment_metadata?.access_url || order?.download_url) && (
                <a
                  href={order?.fulfillment_metadata?.access_url || order?.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Buka Akses / Unduh Materi Sekarang</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Payment Detail Section (QRIS vs Transfer Manual - hanya jika belum lunas) */}
        {!isPaidOrder && (
          isManual ? (
            <div className="space-y-4">
              {/* Rekening Tujuan Transfer */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span>Rekening Tujuan Pembayaran</span>
                </div>

                {/* Bank BCA */}
                <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-blue-400 block">BANK BCA</span>
                    <span className="text-sm font-mono font-bold text-white tracking-wider">847-019-2344</span>
                    <span className="text-[10px] text-slate-400 block">a/n PT BOONTRACK INOVASI DIGITAL</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('8470192344', 'bca')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedField === 'bca' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Bank Mandiri */}
                <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-amber-400 block">BANK MANDIRI</span>
                    <span className="text-sm font-mono font-bold text-white tracking-wider">131-00-1892834-1</span>
                    <span className="text-[10px] text-slate-400 block">a/n PT BOONTRACK INOVASI DIGITAL</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('1310018928341', 'mandiri')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedField === 'mandiri' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Peringatan Kode Unik */}
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">PENTING: Transfer Tepat Sesuai Nominal</span>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Harap transfer tepat hingga 3 digit terakhir (<strong>Rp {grossAmount.toLocaleString('id-ID')}</strong>) agar pesanan Anda dapat diverifikasi otomatis tanpa kendala.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* QR Code Container (QRIS Standar Nasional) */
            <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-inner">
              <div className="p-2.5 bg-white rounded-xl flex items-center justify-center">
                <QRCodeSVG
                  value={rawQrisValue}
                  size={220}
                  level="M"
                  includeMargin={true}
                />
              </div>
              <div className="text-slate-800 font-bold text-center pt-2 text-xs tracking-wide">
                QRIS STANDAR PEMBAYARAN NASIONAL
              </div>
              <p className="text-[10px] text-slate-500 text-center">BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay</p>
            </div>
          )
        )}

        {/* Detail Pengiriman & Kurir Instan (Jika Produk Fisik) */}
        {(order?.shipping_courier || order?.shipping_address) && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-400" />
                <span>Rincian Ekspedisi Pengiriman</span>
              </span>
              {order?.shipping_courier?.toLowerCase().includes('instant') ? (
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-black text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                  Kurir Instan Biteship
                </span>
              ) : (
                <span className="bg-blue-950 text-blue-300 border border-blue-800/60 font-bold text-[10px] px-2.5 py-0.5 rounded-full">
                  Kurir Reguler
                </span>
              )}
            </div>

            <div className="space-y-1.5 pt-0.5">
              {order?.shipping_courier && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>Layanan Kurir:</span>
                  <span className="text-slate-100 font-bold text-xs">{order.shipping_courier}</span>
                </div>
              )}
              {order?.shipping_address && (
                <div className="flex justify-between items-start text-slate-400 gap-3">
                  <span className="shrink-0">Alamat Kirim:</span>
                  <span className="text-slate-200 text-right leading-snug">{order.shipping_address}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Breakdown Rincian Invoice Presisi */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Harga Dasar Produk</span>
            <span className="text-slate-200">Rp {basePrice.toLocaleString('id-ID')}</span>
          </div>

          {productDiscount > 0 && (
            <div className="flex justify-between text-indigo-400 font-medium">
              <span>Diskon Voucher {voucherCode ? `(${voucherCode})` : ''}</span>
              <span>-Rp {productDiscount.toLocaleString('id-ID')}</span>
            </div>
          )}

          {productDiscount > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Harga Bersih Produk</span>
              <span className="text-slate-200 font-semibold">Rp {netProductPrice.toLocaleString('id-ID')}</span>
            </div>
          )}

          {shippingCost > 0 && (
            <div className="flex justify-between text-slate-400">
              <span className="flex items-center gap-1">
                {order?.shipping_courier?.toLowerCase().includes('instant') ? (
                  <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Truck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                )}
                <span>Ongkos Kirim {order?.shipping_courier ? `(${order.shipping_courier})` : ''}</span>
              </span>
              <span className="text-slate-200 font-semibold">Rp {shippingCost.toLocaleString('id-ID')}</span>
            </div>
          )}

          {shippingSubsidy > 0 && (
            <div className="flex justify-between text-emerald-400 font-medium">
              <span>Subsidi Bebas Ongkir</span>
              <span>-Rp {shippingSubsidy.toLocaleString('id-ID')}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-400">
            <span>Biaya Layanan & Admin</span>
            <span className="text-emerald-400 font-semibold">
              Rp 0 (Bebas Biaya Admin)
            </span>
          </div>

          {isManual && uniqueCode > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Kode Unik Verifikasi</span>
              <span className="font-mono text-blue-400 font-bold">+{uniqueCode}</span>
            </div>
          )}

          <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
            <div>
              <span className="text-xs text-slate-400 block">Total Transfer Presisi</span>
              <span className="text-lg font-black text-emerald-400">
                Rp {grossAmount.toLocaleString('id-ID')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(String(grossAmount), 'amount')}
              className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/50 rounded-xl text-emerald-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              {copiedField === 'amount' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nominal Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Total</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* WhatsApp Notification & Confirmation Action */}
        <div className="space-y-3">
          <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-emerald-300">
            <MessageSquare className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>
              Invoice dan rincian transaksi telah dikirimkan otomatis ke WhatsApp Anda
              {order?.customer_phone ? ` (${order.customer_phone})` : ''}.
            </span>
          </div>

          <a
            href={waConfirmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Konfirmasi Pembayaran ke WhatsApp Resmi CS</span>
          </a>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Diverifikasi otomatis & terenkripsi 256-bit PT BOONTRACK INOVASI DIGITAL</span>
        </div>
      </div>
    </div>
  );
}