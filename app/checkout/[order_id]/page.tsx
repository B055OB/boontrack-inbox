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
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { getTenantWhatsApp, getPlatformWhatsApp } from '@/lib/tenant-config';
import { resolveFulfillmentRequirements } from '@/lib/product-catalog';
import { extractTenantBankAccounts, TenantBankAccount } from '@/lib/bank-accounts';



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
  const [tenant, setTenant] = useState<any>(null);
  const [bankAccounts, setBankAccounts] = useState<TenantBankAccount[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [hasAutoRedirected, setHasAutoRedirected] = useState(false);
  const hasTrackedPixelRef = React.useRef(false);

  const triggerPurchasePixels = React.useCallback((orderData: any) => {
    if (hasTrackedPixelRef.current || !orderData) return;
    hasTrackedPixelRef.current = true;

    try {
      const grossVal = Number(orderData.gross_amount || orderData.total_amount || orderData.amount || 0);
      const prodName = orderData.product_title || 'Produk';
      const prodId = String(orderData.product_id || orderData.id || '');

      if (typeof window !== 'undefined') {
        const win = window as any;
        if (typeof win.fbq === 'function') {
          win.fbq('track', 'Purchase', {
            content_name: prodName,
            content_ids: [prodId],
            content_type: 'product',
            value: grossVal,
            currency: 'IDR',
          });
        }
        if (typeof win.ttq === 'object' && typeof win.ttq.track === 'function') {
          win.ttq.track('CompletePayment', {
            content_name: prodName,
            content_id: prodId,
            content_type: 'product',
            value: grossVal,
            currency: 'IDR',
          });
        }
      }
    } catch (pixelErr) {
      console.warn('[Checkout Page] Pixel trigger note:', pixelErr);
    }
  }, []);

  useEffect(() => {
    async function loadOrder() {
      setLoading(true);
      try {
        // 1. Coba baca dari backup lokal untuk instant render awal
        if (typeof window !== 'undefined') {
          const localOrderStr = localStorage.getItem(`bt_order_${orderId}`);
          if (localOrderStr) {
            try {
              const parsed = JSON.parse(localOrderStr);
              if (parsed?.id) {
                setOrder(parsed);
              }
            } catch {}
          }
        }

        const supabase = getSupabase();
        if (supabase) {
          // 2. Query data aktual dari tabel orders (Single Source of Truth)
          const { data: dbOrder } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

          if (dbOrder) {
            let enriched = { ...dbOrder };
            if (!enriched.fulfillment_metadata || !enriched.link_digital) {
              const pSlug = enriched.product_id || enriched.slug;
              if (pSlug) {
                const { data: pData } = await supabase
                  .from('products')
                  .select('*')
                  .eq('slug', pSlug)
                  .maybeSingle();
                if (pData) {
                  enriched = {
                    ...enriched,
                    link_digital: pData.link_digital || enriched.link_digital,
                    asset_reference: pData.asset_reference || enriched.asset_reference,
                    button_text: pData.fulfillment_metadata?.button_text || pData.button_text,
                    fulfillment_metadata: pData.fulfillment_metadata || enriched.fulfillment_metadata
                  };
                }
              }
            }
            setOrder(enriched);
            setLoading(false);

            if (
              dbOrder.status === 'PAID' ||
              dbOrder.status === 'COMPLETED' ||
              dbOrder.status === 'SUCCESS' ||
              dbOrder.status === 'SETTLED' ||
              dbOrder.payment_status === 'PAID' ||
              dbOrder.order_status === 'PAID'
            ) {
              triggerPurchasePixels(enriched);
            }
            return;
          }
        }

        // 3. Fallback fetch dari API backend
        const res = await fetch(getBackendApiUrl(`/api/v1/orders/${orderId}`));
        if (res.ok) {
          const data = await res.json();
          setOrder(data);
          if (data?.status === 'PAID' || data?.payment_status === 'PAID') {
            triggerPurchasePixels(data);
          }
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
  }, [orderId, triggerPurchasePixels]);

  // Polling realtime status pembayaran setiap 2 detik hingga status PAID
  useEffect(() => {
    const isPaid =
      order?.status === 'PAID' ||
      order?.status === 'COMPLETED' ||
      order?.status === 'SUCCESS' ||
      order?.status === 'SETTLED' ||
      order?.payment_status === 'PAID' ||
      order?.order_status === 'PAID';

    if (!orderId || isPaid) {
      if (isPaid && order) {
        triggerPurchasePixels(order);
      }
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: dbOrder } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

          const isOrderPaid = Boolean(
            dbOrder && (
              dbOrder.status === 'PAID' ||
              dbOrder.status === 'COMPLETED' ||
              dbOrder.status === 'SUCCESS' ||
              dbOrder.status === 'SETTLED' ||
              dbOrder.payment_status === 'PAID' ||
              dbOrder.order_status === 'PAID'
            )
          );

          if (isOrderPaid) {
            let enriched = { ...dbOrder };
            if (!enriched.fulfillment_metadata || !enriched.link_digital) {
              const pSlug = enriched.product_id || enriched.slug;
              if (pSlug) {
                const { data: pData } = await supabase
                  .from('products')
                  .select('*')
                  .eq('slug', pSlug)
                  .maybeSingle();
                if (pData) {
                  enriched = {
                    ...enriched,
                    link_digital: pData.link_digital || enriched.link_digital,
                    asset_reference: pData.asset_reference || enriched.asset_reference,
                    button_text: pData.fulfillment_metadata?.button_text || pData.button_text,
                    fulfillment_metadata: pData.fulfillment_metadata || enriched.fulfillment_metadata
                  };
                }
              }
            }
            setOrder((prev: any) => ({
              ...prev,
              ...enriched,
              status: 'PAID',
              payment_status: 'PAID',
            }));
            triggerPurchasePixels(enriched);
            clearInterval(pollInterval);
            return;
          }
        }
      } catch (err) {
        console.warn('[Checkout Polling] Check error:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [orderId, order?.status, order?.payment_status, triggerPurchasePixels]);

  // Sinkronisasi data merchant & rekening transfer bank dinamis dari Supabase
  useEffect(() => {
    if (!order) return;
    const tSlug = (order.tenant_slug || order.tenant_id || '').toLowerCase();

    async function fetchTenantInfo() {
      try {
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const supabase = getSupabase();
        if (supabase && tSlug) {
          let tQuery = supabase.from('tenants').select('*');
          if (isUuid(tSlug)) {
            tQuery = tQuery.or(`slug.eq.${tSlug},id.eq.${tSlug}`);
          } else {
            tQuery = tQuery.eq('slug', tSlug);
          }
          const { data } = await tQuery.maybeSingle();

          if (data) {
            setTenant(data);
            const accounts = extractTenantBankAccounts(data);
            setBankAccounts(accounts);
            return;
          }
        }
        // Fallback: periksa bila data order memuat informasi bank
        setBankAccounts(extractTenantBankAccounts(order));
      } catch (err) {
        console.warn('[Checkout Page] Failed to fetch tenant details:', err);
        setBankAccounts(extractTenantBankAccounts(order));
      }
    }

    fetchTenantInfo();
  }, [order?.tenant_slug, order?.tenant_id]);

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
            tenant_slug: order.tenant_slug || order.tenant_id || '',
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

      // Baca pixel ID: Gunakan meta_pixel_id_override (jika diisi di produk) atau fallback ke default tenant Meta Pixel
      const resolvedMetaPixelId =
        order.meta_pixel_id_override ||
        order.metadata?.meta_pixel_id_override ||
        tenant?.metadata?.pixel_config?.meta_pixel_id ||
        tenant?.metadata?.meta_pixel_id ||
        null;

      const resolvedTTPixelId =
        order.tiktok_pixel_id_override ||
        order.metadata?.tiktok_pixel_id_override ||
        tenant?.metadata?.pixel_config?.tiktok_pixel_id ||
        tenant?.metadata?.tiktok_pixel_id ||
        null;

      if (resolvedMetaPixelId) {
        initMetaPixel(resolvedMetaPixelId);
      }
      if (resolvedTTPixelId) {
        initTikTokPixel(resolvedTTPixelId);
      }

      trackClientPurchase(orderId, gross, title);
      setHasTrackedPurchase(true);
    }
  }, [order, tenant, orderId, hasTrackedPurchase]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const isManual = order?.payment_method === 'manual_transfer' || order?.payment_method === 'manual';
  const grossAmount = Number(order?.gross_amount || order?.total_amount || order?.amount || 100000);
  const rawUniqueCode = Number(order?.unique_code || 0);
  const adminFee = 0;
  const productDiscount = Number(order?.product_discount || order?.discount_amount || 0);
  const voucherCode = order?.voucher_code || order?.coupon_code || '';
  const shippingCost = Number(order?.shipping_cost || 0);
  const shippingSubsidy = Number(order?.shipping_subsidy || 0);
  const netShippingCost = Number(order?.net_shipping_cost || Math.max(0, shippingCost - shippingSubsidy));

  let basePrice = Number(order?.base_price || 0);
  if (!basePrice) {
    if (order?.net_product_price) {
      basePrice = Number(order.net_product_price) + productDiscount;
    } else if (isManual) {
      basePrice = Math.max(0, grossAmount - netShippingCost - rawUniqueCode + productDiscount);
    } else {
      basePrice = Math.max(0, grossAmount - netShippingCost + rawUniqueCode + productDiscount);
    }
  }
  if (!basePrice) basePrice = 100000;

  const netProductPrice = Number(order?.net_product_price || Math.max(0, basePrice - productDiscount));

  const uniqueCode = rawUniqueCode > 0
    ? rawUniqueCode
    : (!isManual && (basePrice - productDiscount + netShippingCost) > grossAmount
        ? (basePrice - productDiscount + netShippingCost) - grossAmount
        : 0);

  const rawOrderType =
    order?.product_type ||
    (order?.shipping_address
      ? 'PHYSICAL'
      : order?.booking_date || order?.service_schedule || order?.category === 'jasa'
      ? 'FIELD_SERVICE'
      : 'DIGITAL');
  const orderRequirements = resolveFulfillmentRequirements(rawOrderType);
  const isPaidOrder =
    order?.status === 'PAID' ||
    order?.status === 'COMPLETED' ||
    order?.status === 'SUCCESS' ||
    order?.status === 'SETTLED' ||
    order?.payment_status === 'PAID' ||
    order?.order_status === 'PAID';

  const fallbackQrisString =
    tenant?.qris_content ||
    tenant?.qris_payload ||
    tenant?.qris_static_string ||
    tenant?.metadata?.qris_content ||
    tenant?.metadata?.qris_payload ||
    tenant?.metadata?.qris_static_string ||
    tenant?.metadata?.qris?.static_qr ||
    tenant?.metadata?.payment_config?.qris_content ||
    tenant?.metadata?.payment_config?.raw_qris_string ||
    tenant?.metadata?.payment_config?.static_qris_payload ||
    tenant?.metadata?.raw_qris_string ||
    tenant?.metadata?.static_qris_payload ||
    '';

  const fallbackQrisImage =
    tenant?.qris_image_url ||
    tenant?.qris_url ||
    tenant?.qris_image ||
    tenant?.metadata?.qris_image_url ||
    tenant?.metadata?.qris_url ||
    tenant?.metadata?.qris_image ||
    tenant?.metadata?.payment_settings?.qris ||
    tenant?.metadata?.payment_config?.qris_image_url ||
    tenant?.metadata?.payment_config?.manual_config?.qris_image_url ||
    '';

  const tenantSlug = (order?.tenant_slug || order?.tenant_id || '').toLowerCase();
  const orderQrImage = order?.qr_code_url || (order?.qr_string && (order.qr_string.startsWith('http://') || order.qr_string.startsWith('https://')) ? order.qr_string : '');
  const candidateQrImageUrl = orderQrImage || fallbackQrisImage;

  // Dynamic QRIS: pastikan selalu dinamis jika ada payload string EMVCo (000201...)
  const candidateQris = (order?.qr_string && order.qr_string.startsWith('000201')) ? order.qr_string : fallbackQrisString;
  const rawQrisValue = candidateQris ? generateDynamicQRIS(candidateQris, grossAmount) : '';
  const targetWaNumber =
    tenant?.metadata?.whatsapp_number ||
    tenant?.metadata?.whatsapp ||
    tenant?.whatsapp_number ||
    tenant?.phone ||
    getTenantWhatsApp(tenantSlug) ||
    getPlatformWhatsApp();

  const storeDisplayName =
    tenant?.name ||
    (tenantSlug ? tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1) : 'Toko');

  const confirmationCallToAction =
    orderRequirements.strategy === 'SERVICE'
      ? 'Mohon dicek dan konfirmasi jadwal layanan saya. Terima kasih!'
      : orderRequirements.strategy === 'PHYSICAL'
      ? 'Mohon dicek dan proses pengiriman pesanan saya. Terima kasih!'
      : 'Mohon dicek dan aktivasi akses saya. Terima kasih!';

  const accessUrlCandidate =
    order?.fulfillment_metadata?.access_url ||
    order?.link_digital ||
    order?.asset_reference ||
    order?.download_url ||
    order?.delivery_url ||
    (order?.product_id === 'ctwa-mastery-7day' || (order?.product_title || '').toLowerCase().includes('ctwa')
      ? 'https://t.me/+zhWxgGbzZxhmMjU1'
      : null);

  const isTelegram =
    order?.fulfillment_metadata?.delivery_type === 'TELEGRAM_GROUP' ||
    (typeof accessUrlCandidate === 'string' && accessUrlCandidate.includes('t.me'));

  const ctaButtonText =
    order?.fulfillment_metadata?.button_text ||
    order?.button_text ||
    (isTelegram ? '🚀 Gabung Grup Telegram Kelas Sekarang' : 'Buka Akses / Unduh Materi Sekarang');

  // Auto-redirect ke Telegram/link akses pasca status bayar PAID (countdown 3 detik)
  useEffect(() => {
    if (!isPaidOrder || !accessUrlCandidate || hasAutoRedirected) return;

    const redirectTimer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(redirectTimer);
          setHasAutoRedirected(true);
          try {
            window.open(accessUrlCandidate, '_blank', 'noopener,noreferrer');
          } catch (e) {
            console.warn('[Auto redirect error]:', e);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(redirectTimer);
  }, [isPaidOrder, accessUrlCandidate, hasAutoRedirected]);

  const waConfirmUrl = `https://wa.me/${targetWaNumber}?text=${encodeURIComponent(
    `Halo ${storeDisplayName}, saya ingin konfirmasi pembayaran untuk:\n\nOrder ID: ${orderId}\nProduk: ${order?.product_title || 'Pesanan'}\nNama: ${order?.customer_name || '-'}\nTotal Nominal: Rp ${grossAmount.toLocaleString('id-ID')}\nMetode: ${isManual ? 'Transfer Bank Manual' : 'QRIS Dinamis'}\n\n${confirmationCallToAction}`
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

        {/* Kartu Akses Delivery Payload / Grup Telegram Jika Status Lunas (PAID) */}
        {isPaidOrder && (
          <div className="bg-gradient-to-b from-emerald-950/80 via-slate-900 to-slate-900 border-2 border-emerald-500/80 rounded-3xl p-5 space-y-4 shadow-2xl shadow-emerald-950/50 text-xs animate-in fade-in zoom-in-95 duration-500">
            {/* Header Ucapan Selamat */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-7 h-7 text-slate-950 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/90 px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-700/60 inline-block">
                  Pembayaran Terverifikasi (LUNAS)
                </span>
                <h2 className="text-lg font-black text-white">
                  Selamat! Pembayaran Anda Berhasil 🎉
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  {isTelegram
                    ? 'Akses ke Grup Telegram Kelas Eksklusif sudah aktif. Anda dapat langsung bergabung sekarang tanpa wajib menunggu chat WhatsApp!'
                    : 'Akses produk dan layanan Anda sudah aktif dan siap digunakan.'}
                </p>
              </div>
            </div>

            {/* Tombol Utama Akses Telegram / Link Digital */}
            {accessUrlCandidate ? (
              <div className="space-y-2.5 pt-1">
                <a
                  href={accessUrlCandidate}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setHasAutoRedirected(true)}
                  className="w-full py-4 px-5 bg-gradient-to-r from-blue-600 via-emerald-600 to-teal-500 hover:from-blue-500 hover:via-emerald-500 hover:to-teal-400 text-white font-black text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transform hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer border border-emerald-400/40 group"
                >
                  <Sparkles className="w-5 h-5 text-emerald-200 animate-pulse" />
                  <span>{ctaButtonText}</span>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>

                {/* Auto redirect notification */}
                {countdown > 0 && !hasAutoRedirected ? (
                  <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>Otomatis dialihkan ke grup Telegram dalam <strong className="text-amber-300 font-mono font-bold text-xs">{countdown}</strong> detik...</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-center text-slate-400">
                    💡 <em>Klik tombol di atas jika link grup Telegram belum terbuka otomatis di tab baru.</em>
                  </p>
                )}
              </div>
            ) : null}

            {/* Rincian Petunjuk / Lisensi */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Metode Akses:</span>
                <span className="font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/60 text-[11px]">
                  {isTelegram
                    ? '🚀 Grup Telegram Eksklusif'
                    : order?.fulfillment_metadata?.delivery_type === 'DOWNLOAD_LINK'
                    ? '📥 Link Download Instan'
                    : order?.fulfillment_metadata?.delivery_type === 'LICENSE_KEY'
                    ? '🔑 Lisensi / Kode Akses'
                    : '📋 Form Brief Klien'}
                </span>
              </div>

              {order?.fulfillment_metadata?.license_key && (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-blue-400" />
                    <span>Kunci Lisensi / Akses:</span>
                  </span>
                  <div className="font-mono text-sm font-bold text-blue-400 select-all bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                    {order.fulfillment_metadata.license_key}
                  </div>
                </div>
              )}

              {(order?.fulfillment_metadata?.instructions || isTelegram) && (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 block flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Petunjuk Penggunaan:</span>
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    {order?.fulfillment_metadata?.instructions ||
                      'Pastikan aplikasi Telegram Anda sudah terpasang di HP atau Laptop. Klik tombol di atas untuk langsung bergabung ke grup kelas dan pantau materi sprint 7 hari.'}
                  </p>
                </div>
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

                {bankAccounts.length > 0 ? (
                  <div className="space-y-2.5">
                    {bankAccounts.map((acc, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-[10px] font-bold text-blue-400 block tracking-wide">
                            {acc.bank_name}
                          </span>
                          <span className="text-sm font-mono font-bold text-white tracking-wider">
                            {acc.account_number}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            a/n {acc.account_holder}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(acc.account_number, `bank_${idx}`)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedField === `bank_${idx}` ? (
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
                    ))}
                  </div>
                ) : (
                  /* Kondisi Jika Merchant Belum Mengisi Rekening Bank: JANGAN tampilkan rekening mock platform */
                  <div className="p-4 bg-slate-900/90 border border-amber-500/30 rounded-xl space-y-3 text-center">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-200">
                        Rekening Transfer Toko Sedang Disiapkan
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Toko belum melampirkan rekening otomatis. Silakan konfirmasi pembayaran langsung via WhatsApp Toko atau gunakan QRIS Instan.
                      </p>
                    </div>
                    <div className="pt-1 flex flex-col gap-2">
                      <a
                        href={waConfirmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Konfirmasi Pembayaran via WhatsApp Toko</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setOrder((prev: any) => ({ ...prev, payment_method: 'qris' }));
                        }}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Beralih ke QRIS Instan (Bebas Biaya Admin)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Peringatan Kode Unik */}
              {bankAccounts.length > 0 && uniqueCode > 0 && (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">PENTING: Transfer Tepat Sesuai Nominal</span>
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      Harap transfer tepat hingga 3 digit terakhir (<strong>Rp {grossAmount.toLocaleString('id-ID')}</strong>) agar pesanan Anda dapat diverifikasi otomatis tanpa kendala.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : rawQrisValue ? (
            /* QR Code Container (QRIS Standar Nasional SVG Dinamis) */
            <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-inner">
              <div className="mb-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-[11px] font-bold shadow-xs">
                <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                <span>QRIS Dinamis • Nominal Pas Otomatis</span>
              </div>
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

              <div className="mt-2.5 pt-2 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-600">
                <span className="text-slate-500">Nominal Terkunci:</span>
                <span className="font-extrabold text-emerald-700">Rp {grossAmount.toLocaleString('id-ID')}</span>
              </div>
            </div>
          ) : candidateQrImageUrl ? (
            /* Gambar QRIS Toko Resmi (Fallback dari Upload Dashboard) */
            <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-inner">
              <div className="p-2.5 bg-white rounded-xl flex items-center justify-center max-w-[260px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidateQrImageUrl}
                  alt="QRIS Toko Resmi"
                  className="w-full h-auto max-h-[280px] object-contain rounded-lg"
                />
              </div>
              <div className="text-slate-800 font-bold text-center pt-2 text-xs tracking-wide">
                QRIS TOKO RESMI
              </div>
              <p className="text-[10px] text-slate-500 text-center">Scan via BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay</p>
            </div>
          ) : (
            /* Error banner jika QRIS toko belum dikonfigurasi */
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-2xl p-5 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="font-bold text-amber-200 text-sm">Metode Pembayaran Belum Siap</h3>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Metode pembayaran QRIS toko belum dikonfigurasi. Silakan hubungi pemilik toko.
              </p>
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
            <span>Harga Produk</span>
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

          {!isManual && uniqueCode > 0 && (
            <div className="flex justify-between text-emerald-400 font-medium">
              <span>Potongan Kode Unik</span>
              <span className="font-mono font-bold">-Rp {uniqueCode.toLocaleString('id-ID')}</span>
            </div>
          )}

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
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>
              {isPaidOrder
                ? 'Chat Admin CS via WhatsApp (Bantuan / Pertanyaan)'
                : 'Konfirmasi Pembayaran ke WhatsApp Resmi CS'}
            </span>
          </a>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Diverifikasi otomatis & terenkripsi 256-bit SSL BoonTrack Secure</span>
        </div>
      </div>
    </div>
  );
}