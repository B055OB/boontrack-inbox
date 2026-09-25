"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, QrCode, ArrowRight, Loader2, CheckCircle2, Building2, Lock, Copy, Check, MessageSquare, AlertTriangle, Download, ExternalLink, Package, Truck, Calendar } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createOrderAndInvoice } from "@/lib/checkout-service";
import { getActiveAffiliateCode, getTrackingData, trackClientPurchase, trackLeadFormSubmission, formatIndonesianWhatsAppNumber, initMetaPixel, initTikTokPixel } from "@/lib/tracking";
import { generateDynamicQRIS } from "@/lib/qris-dynamic";
import { getSupabase } from "@/lib/supabaseClient";
import { extractTenantBankAccounts, TenantBankAccount } from "@/lib/bank-accounts";



interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  product: {
    id: string;
    title: string;
    price: number;
    download_url?: string;
    link_digital?: string;
    delivery_url?: string;
    category?: string;
    type?: string;
    product_type?: string;
    fulfillment_metadata?: any;
    external_url?: string;
    cta_label?: string;
    meta_pixel_id_override?: string;
    tiktok_pixel_id_override?: string;
    slot?: {
      slotDate: string;
      startTime: string;
      displayLabel: string;
      businessTopic: string;
    };
  } | null;
}

export default function CheckoutModal({ isOpen, onClose, tenantSlug, product }: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingCourier, setShippingCourier] = useState("Kurir Reguler (J&T / SiCepat)");
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [tenantMetaPixel, setTenantMetaPixel] = useState<string>("");
  const [tenantTTPixel, setTenantTTPixel] = useState<string>("");

  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'manual_transfer'>('qris');
  const [uniqueCode] = useState(() => Math.floor(1 + Math.random() * 999));
  const [affiliateCode, setAffiliateCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    orderId: string;
    invoiceUrl?: string;
    qr_string?: string;
    qrString?: string;
    qrCodeUrl?: string;
    qr_code_url?: string;
    paymentMethod?: 'qris' | 'manual_transfer';
  } | null>(null);
  const qrData = paymentData;
  const [orderStatus, setOrderStatus] = useState<'PENDING' | 'PAID' | string>('PENDING');
  const [orderFulfillment, setOrderFulfillment] = useState<{
    access_url?: string;
    instructions?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [qrisError, setQrisError] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tenantPhone, setTenantPhone] = useState<string>("");
  const [bankAccounts, setBankAccounts] = useState<TenantBankAccount[]>([]);
  const [tenantStaticQris, setTenantStaticQris] = useState<string>("");
  const [tenantQrisImageUrl, setTenantQrisImageUrl] = useState<string>("");

  // Resolver Context Fulfillment Digital vs Fisik vs Booking/Service
  const rawProductType = (product?.product_type || product?.type || (product?.category === 'fisik' || product?.category === 'physical' ? 'physical' : 'digital')).toLowerCase();
  const isPhysical = rawProductType === 'physical' || rawProductType === 'fisik';
  const isBookingOrService = rawProductType === 'service' || rawProductType === 'booking' || rawProductType === 'consultation' || Boolean(product?.slot);
  const isDigital = !isPhysical;

  const handleCopy = (text: string, field: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const basePrice = product?.price || 0;
  // Biaya admin Rp0 untuk QRIS maupun Transfer Manual (dana langsung masuk ke seller)
  const adminFee = 0;
  const isQris = paymentMethod === 'qris';
  const currentUniqueCode = uniqueCode;
  const currentShippingCost = isPhysical ? shippingCost : 0;
  const totalAmount = isQris
    ? Math.max(1000, basePrice + adminFee + currentShippingCost - currentUniqueCode)
    : basePrice + adminFee + currentUniqueCode + currentShippingCost;
  const affiliateCommission = 0; // Fitur affiliate produk ritel dinonaktifkan sementara (murni direct store)

  // LAZY SHIPPING: DILARANG dipicu saat modal pertama kali dimuat.
  // Hanya dipanggil saat pembeli selesai mengisi kecamatan/kota tujuan (debounce 400ms).
  useEffect(() => {
    if (!isOpen || !isPhysical) {
      setShippingCost(0);
      return;
    }

    const trimmedDest = shippingCity.trim();
    if (trimmedDest.length < 3) {
      setShippingCost(0);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoadingShipping(true);
      try {
        const res = await fetch('/api/v1/shipping/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination_city: trimmedDest,
            tenant_slug: tenantSlug,
            weight_grams: 1000,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.rates) && data.rates.length > 0) {
            const basic = data.rates[0];
            setShippingCost(basic.price || 15000);
            setShippingCourier(basic.courier_name || 'Kurir Reguler (J&T / SiCepat)');
          } else {
            setShippingCost(15000);
            setShippingCourier('Kurir Reguler (J&T / SiCepat)');
          }
        } else {
          setShippingCost(15000);
          setShippingCourier('Kurir Reguler (J&T / SiCepat)');
        }
      } catch (err) {
        console.warn('[CheckoutModal] Lazy shipping rate note:', err);
        setShippingCost(15000);
        setShippingCourier('Kurir Reguler (J&T / SiCepat)');
      } finally {
        setIsLoadingShipping(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, isPhysical, shippingCity, tenantSlug]);

  // Load tenant metadata, bank accounts, and default pixel IDs
  useEffect(() => {
    // FIX: Hanya baca affiliate code dari URL param sesi ini.
    // Jangan ambil dari localStorage tanpa validasi URL — mencegah
    // referral sesi testing sebelumnya (misal 'buzzerukm') bocor ke
    // toko tenant lain yang dibuka di browser yang sama.
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const refFromUrl = urlParams.get('ref') || urlParams.get('aff');
      if (refFromUrl) {
        // Hanya set jika URL aktif memang membawa ?ref= param
        setAffiliateCode(refFromUrl.trim());
      } else {
        // Tidak ada ref di URL saat ini — pastikan state bersih
        setAffiliateCode(undefined);
      }
    }
    if (isOpen && tenantSlug) {
      setQrisError(false);
      async function loadTenant() {
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data } = await supabase
              .from('tenants')
              .select('*')
              .eq('slug', tenantSlug)
              .maybeSingle();
            if (data) {
              const phone = data?.metadata?.whatsapp_number || data?.metadata?.whatsapp || data?.phone || '';
              if (phone) setTenantPhone(phone);
              const metaId = data?.metadata?.pixel_config?.meta_pixel_id || data?.metadata?.meta_pixel_id || '';
              if (metaId) setTenantMetaPixel(metaId);
              const ttId = data?.metadata?.pixel_config?.tiktok_pixel_id || data?.metadata?.tiktok_pixel_id || '';
              if (ttId) setTenantTTPixel(ttId);

              const accounts = extractTenantBankAccounts(data);
              setBankAccounts(accounts);
              if (accounts.length === 0) {
                setPaymentMethod('qris');
              }

              const staticQris =
                data?.metadata?.payment_settings?.qris_raw ||
                data?.metadata?.payment_settings?.raw_qris_string ||
                data?.metadata?.qris_raw ||
                data?.metadata?.raw_qris_string ||
                (data as any)?.qris_content ||
                (data as any)?.qris_payload ||
                (data as any)?.qris_static_string ||
                data?.metadata?.qris_content ||
                data?.metadata?.qris_payload ||
                data?.metadata?.qris_static_string ||
                data?.metadata?.qris?.static_qr ||
                data?.metadata?.payment_config?.qris_content ||
                data?.metadata?.payment_config?.raw_qris_string ||
                data?.metadata?.payment_config?.static_qris_payload ||
                data?.metadata?.static_qris_payload ||
                '';
              if (staticQris) {
                setTenantStaticQris(staticQris);
              }

              const qrisImg =
                (data as any)?.qris_image_url ||
                (data as any)?.qris_url ||
                (data as any)?.qris_image ||
                data?.metadata?.qris_image_url ||
                data?.metadata?.qris_url ||
                data?.metadata?.qris_image ||
                data?.metadata?.payment_settings?.qris ||
                data?.metadata?.payment_config?.qris_image_url ||
                data?.metadata?.payment_config?.manual_config?.qris_image_url ||
                '';
              if (qrisImg) {
                setTenantQrisImageUrl(qrisImg);
              }
            }
          }
        } catch {}
      }
      loadTenant();
    }
  }, [isOpen, tenantSlug]);

  // Inisialisasi Browser Pixel: prioritaskan meta_pixel_id_override di produk, fallback ke tenant pixel
  useEffect(() => {
    if (isOpen && product) {
      const activeMetaId = product.meta_pixel_id_override || tenantMetaPixel;
      if (activeMetaId) {
        initMetaPixel(activeMetaId);
      }
      const activeTTId = product.tiktok_pixel_id_override || tenantTTPixel;
      if (activeTTId) {
        initTikTokPixel(activeTTId);
      }
    }
  }, [isOpen, product, tenantMetaPixel, tenantTTPixel]);

  // Real-time polling to detect when order is paid & fire browser purchase events
  useEffect(() => {
    if (!paymentData?.orderId) return;

    let active = true;
    const checkStatus = async () => {
      try {
        let isPaid = false;
        let accessUrl: string | undefined = undefined;
        let instructions: string | undefined = undefined;

        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(paymentData.orderId)}/status`, {
            cache: 'no-store',
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.status === 'PAID') {
              isPaid = true;
              accessUrl = data.link_digital || data.fulfillment_metadata?.access_url;
              instructions = data.fulfillment_metadata?.instructions;
            }
          }
        } catch {}

        if (!isPaid && paymentData?.orderId && paymentData.orderId !== 'undefined' && paymentData.orderId !== 'null') {
          const supabase = getSupabase();
          if (supabase) {
            const { data: ord } = await supabase
              .from('orders')
              .select('id, status, payment_status')
              .eq('id', paymentData.orderId)
              .maybeSingle();

            if (ord) {
              const statusUpper = (ord.payment_status || ord.status || '').toUpperCase();
              if (statusUpper === 'PAID' || statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS' || statusUpper === 'SETTLED') {
                isPaid = true;
                accessUrl = product?.download_url || product?.link_digital || product?.delivery_url;
                instructions = product?.fulfillment_metadata?.instructions;
              }
            }
          }
        }

        if (isPaid && active) {
          setOrderStatus('PAID');
          const resolvedAccess =
            accessUrl ||
            product?.download_url ||
            product?.link_digital ||
            product?.delivery_url;

          setOrderFulfillment({
            access_url: resolvedAccess,
            instructions: instructions,
          });

          // Fire standard browser pixel events on paid verification
          if (typeof window !== "undefined") {
            const win = window as any;
            if (typeof win.fbq === "function") {
              win.fbq("track", "Purchase", {
                content_name: product?.title || 'Order Checkout',
                value: totalAmount,
                currency: "IDR",
              });
            }
            if (typeof win.ttq === "object" && typeof win.ttq.track === "function") {
              win.ttq.track("CompletePayment", {
                content_name: product?.title || 'Order Checkout',
                value: totalAmount,
                currency: "IDR",
              });
            }
          }
        }
      } catch {}
    };

    let checkCount = 0;
    const guardedCheckStatus = async () => {
      checkCount++;
      if (checkCount > 45) { // Stop after ~3 minutes
        clearInterval(interval);
        return;
      }
      await checkStatus();
    };

    guardedCheckStatus();
    const interval = setInterval(guardedCheckStatus, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [paymentData?.orderId, product, totalAmount]);

  if (!isOpen || !product) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    const trackingParams = getTrackingData();
    const resolvedProductType = isBookingOrService
      ? (product?.product_type || 'SERVICE')
      : (isPhysical ? 'PHYSICAL' : 'DIGITAL');

    const resolvedAccessUrl =
      product.download_url ||
      product.link_digital ||
      product.delivery_url ||
      product.fulfillment_metadata?.access_url ||
      '';

    const resolvedFulfillmentMetadata = product?.slot
      ? {
          ...(product.fulfillment_metadata || {}),
          delivery_type: 'CONSULTATION_SESSION',
          slot: product.slot,
          scheduled_at: product.slot.slotDate,
          time_slot: product.slot.startTime,
          business_topic: product.slot.businessTopic,
          display_label: product.slot.displayLabel,
          instructions: 'Sesi konsultasi Anda telah dijadwalkan secara resmi.',
        }
      : (product.fulfillment_metadata || (resolvedAccessUrl ? {
          delivery_type: 'DOWNLOAD_LINK',
          access_url: resolvedAccessUrl,
          instructions: 'Akses materi digital Anda telah aktif secara instan.'
        } : undefined));

    const trackingWithSlot = {
      ...trackingParams,
      ...(product?.slot ? {
        scheduled_at: product.slot.slotDate,
        time_slot: product.slot.startTime,
        business_topic: product.slot.businessTopic,
      } : {}),
    };

    try {
      const result = await createOrderAndInvoice({
        tenantSlug,
        productId: product.id,
        productTitle: product.title,
        amount: totalAmount,
        basePrice,
        adminFee,
        uniqueCode: currentUniqueCode,
        paymentMethod,
        affiliateCommission: 0,
        customerName,
        customerPhone,
        customerEmail: isDigital ? (customerEmail || undefined) : undefined,
        shippingAddress: isPhysical ? shippingAddress : undefined,
        shippingCourier: isPhysical ? shippingCourier : undefined,
        shippingCost: isPhysical ? shippingCost : 0,
        netShippingCost: isPhysical ? shippingCost : 0,
        affiliateCode: undefined, // Murni direct store ke toko merchant
        tracking: trackingWithSlot,
        productType: resolvedProductType,
        fulfillmentMetadata: resolvedFulfillmentMetadata,
      });

      // Trigger Client-side Purchase Event & Browser Pixel
      if (result?.orderId) {
        trackClientPurchase(result.orderId, totalAmount, product.title);
        trackLeadFormSubmission(totalAmount);

        // Kunci atomic booking slot jika produk merupakan sesi booking jadwal
        if (product?.slot) {
          fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/book-slot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slot_date: product.slot.slotDate,
              start_time: product.slot.startTime,
              customer_name: customerName,
              customer_phone: customerPhone,
              customer_email: customerEmail,
              business_topic: product.slot.businessTopic,
              service_title: product.title,
              order_id: result.orderId,
              idempotency_key: `IDEMP-${result.orderId}`,
            }),
          }).catch((err) => console.warn('[Checkout] Booking slot reservation warning:', err));
        }

        if (typeof window !== "undefined") {
          const win = window as any;
          if (typeof win.fbq === "function") {
            win.fbq("track", "Purchase", {
              content_name: product.title,
              value: totalAmount,
              currency: "IDR",
            });
          }
          if (typeof win.ttq === "object" && typeof win.ttq.track === "function") {
            win.ttq.track("CompletePayment", {
              content_name: product.title,
              value: totalAmount,
              currency: "IDR",
            });
          }
        }
      }

      setPaymentData({
        orderId: result.orderId,
        invoiceUrl: result.invoiceUrl,
        qr_string: (result as any).qr_string || result.qrString,
        qrString: result.qrString || (result as any).qr_string,
        qrCodeUrl: result.qrCodeUrl,
        paymentMethod: paymentMethod,
      });
      setOrderStatus('PENDING');
      if (resolvedAccessUrl) {
        setOrderFulfillment({ access_url: resolvedAccessUrl });
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal memproses pesanan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto safe-pb">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-5 text-slate-100 shadow-2xl relative max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 sticky top-0 bg-slate-900 z-10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-blue-400" />
              <span>Single Page Checkout</span>
            </h3>
            <p className="text-[11px] text-slate-400">Pemesanan ringkas satu langkah</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {product.external_url ? (
          <div className="text-center space-y-4 py-4 animate-in fade-in duration-200">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-2xl flex items-center justify-center mx-auto border border-purple-500/30">
              <ExternalLink className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-block px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold rounded-full mb-1">
                Produk Mitra Resmi
              </span>
              <h4 className="font-bold text-white text-base mt-1">{product.title}</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Produk ini ditransaksikan langsung melalui link partner resmi kami (Shopee, TikTok, Sejoli, dll).
              </p>
            </div>
            <div className="pt-2">
              <a
                href={product.external_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
                    (window as any).fbq("track", "InitiateCheckout", {
                      content_name: product.title || (product as any).name,
                      content_ids: [product.id || (product as any).slug],
                      content_type: "product",
                      value: Number(product.price) || 0,
                      currency: "IDR"
                    });
                  }
                  onClose();
                }}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-purple-600/30 cursor-pointer text-center"
              >
                <span>{product.cta_label || 'Beli di Platform Partner'}</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : paymentData ? (
          orderStatus === 'PAID' ? (
            /* Tampilan Lunas / Akses Digital Siap */
            <div className="text-center space-y-4 py-4 animate-in fade-in duration-200">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <span className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-full mb-1">
                  Pembayaran Terverifikasi (Lunas)
                </span>
                <h4 className="font-black text-white text-base">
                  {isBookingOrService ? 'Sesi Konsultasi Berhasil Terjadwal!' : 'Akses Produk Digital Siap!'}
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Order ID: {paymentData.orderId}</p>
              </div>

              <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 text-left space-y-3 shadow-inner">
                {isBookingOrService ? (
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Selamat! Pembayaran untuk <strong>{product.title}</strong> telah terkonfirmasi. Jadwal sesi konsultasi privat Anda resmi dikunci:
                    </p>
                    <div className="p-3.5 bg-emerald-950/50 border border-emerald-500/40 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{product.slot?.displayLabel || 'Sesi Terjadwal 1-on-1'}</span>
                      </div>
                      {product.slot?.businessTopic && (
                        <p className="text-[11px] text-slate-300">
                          Topik: <span className="text-white font-medium">{product.slot.businessTopic}</span>
                        </p>
                      )}
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                      <p className="text-xs font-bold text-indigo-300">
                        Link Room &amp; Kalender Sesi
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Tautan Google Meet / Zoom dan reminder kalender otomatis dikirimkan ke WhatsApp Anda (<strong>{customerPhone}</strong>).
                      </p>
                    </div>
                  </div>
                ) : orderFulfillment?.access_url ? (
                  <>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Selamat! Pembayaran untuk <strong>{product.title}</strong> telah selesai. Anda dapat langsung membuka akses materi sekarang:
                    </p>
                    <a
                      href={orderFulfillment.access_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Buka Akses / Unduh Materi Sekarang</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </>
                ) : (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center space-y-1">
                    <p className="text-xs font-bold text-amber-300">
                      Akses produk digital Anda sedang disiapkan oleh admin toko.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Detail link dan instruksi akses otomatis dikirimkan ke WhatsApp Anda (<strong>{customerPhone}</strong>).
                    </p>
                  </div>
                )}
              </div>

              {paymentData.invoiceUrl && (
                <a
                  href={paymentData.invoiceUrl}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
                >
                  <span>Lihat Rincian Faktur / Invoice</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ) : (
          /* Tampilan Menunggu Pembayaran */
          <div className="text-center space-y-4 py-4">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-base">Pesanan Berhasil Dibuat!</h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Order ID: {paymentData.orderId}</p>
            </div>

            {paymentData.paymentMethod === 'qris' && (() => {
              const candidateQris = (paymentData.qr_string?.startsWith('000201') || paymentData.qrString?.startsWith('000201'))
                ? (paymentData.qr_string || paymentData.qrString)
                : tenantStaticQris;
              const candidateQrImage =
                paymentData.qrCodeUrl ||
                paymentData.qr_code_url ||
                (paymentData.qr_string && (paymentData.qr_string.startsWith('http://') || paymentData.qr_string.startsWith('https://')) ? paymentData.qr_string : '') ||
                tenantQrisImageUrl ||
                '';

              if (!candidateQris && !candidateQrImage) {
                return (
                  <div className="bg-amber-950/40 border border-amber-800/50 rounded-2xl p-4 text-center space-y-2 my-3">
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                    <p className="text-xs text-amber-300 font-medium">
                      Metode pembayaran QRIS toko belum dikonfigurasi. Silakan hubungi pemilik toko.
                    </p>
                  </div>
                );
              }

              const cleanWa = formatIndonesianWhatsAppNumber(tenantPhone || '6281237450222');
              const waConfirmUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(
                `Halo Admin, saya ingin konfirmasi pembayaran untuk Order ID: ${paymentData.orderId}\nProduk: ${product.title}\nNominal: Rp ${totalAmount.toLocaleString('id-ID')}`
              )}`;

              const qrContainer = candidateQris ? (
                <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center my-2 shadow-inner">
                  <div className="p-2.5 bg-white rounded-xl flex items-center justify-center">
                    <QRCodeSVG
                      value={generateDynamicQRIS(candidateQris, totalAmount)}
                      size={220}
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                  <div className="text-slate-800 font-bold text-center pt-2 text-xs tracking-wide">
                    QRIS STANDAR PEMBAYARAN NASIONAL
                  </div>
                  <p className="text-[10px] text-slate-500 text-center">
                    BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay
                  </p>
                  <p className="text-[9px] text-emerald-600 font-mono font-bold mt-1">
                    Nominal Tagihan: Rp {totalAmount.toLocaleString('id-ID')}
                  </p>
                </div>
              ) : (
                <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center my-2 shadow-inner">
                  <div className="p-2.5 bg-white rounded-xl flex items-center justify-center max-w-[240px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={candidateQrImage}
                      alt="QRIS Toko Resmi"
                      className="w-full h-auto max-h-[260px] object-contain rounded-lg"
                    />
                  </div>
                  <div className="text-slate-800 font-bold text-center pt-2 text-xs tracking-wide">
                    QRIS TOKO RESMI
                  </div>
                  <p className="text-[10px] text-slate-500 text-center">
                    Scan via BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay
                  </p>
                  <p className="text-[9px] text-emerald-600 font-mono font-bold mt-1">
                    Nominal Tagihan: Rp {totalAmount.toLocaleString('id-ID')}
                  </p>
                </div>
              );

              return (
                <div className="space-y-3">
                  {qrContainer}

                  {/* Fallback Rekening & Bantuan Transfer Manual jika QRIS berkendala */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 text-left text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-400" /> Alternatif Transfer Manual
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Bebas Biaya</span>
                    </div>

                    {bankAccounts.length > 0 ? (
                      <div className="space-y-2">
                        {bankAccounts.map((acc, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-900 rounded-xl border border-slate-800/80">
                            <div>
                              <span className="text-[9px] font-bold text-blue-400 block">{acc.bank_name}</span>
                              <span className="font-mono font-bold text-white text-xs">{acc.account_number}</span>
                              <span className="text-[9px] text-slate-400 block">a/n {acc.account_holder}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(acc.account_number, `bank_${idx}`)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              {copiedField === `bank_${idx}` ? <><Check className="w-3 h-3 text-emerald-400" /> Tersalin</> : <><Copy className="w-3 h-3" /> Salin</>}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
                        <p className="text-slate-400">
                          Mengalami kendala pada QRIS? Anda dapat langsung menghubungi CS Toko via WhatsApp untuk bantuan pembayaran.
                        </p>
                      </div>
                    )}

                    {/* Tombol Konfirmasi Instan WhatsApp */}
                    <a
                      href={waConfirmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/25 cursor-pointer mt-1"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Konfirmasi Pembayaran via WhatsApp</span>
                    </a>
                  </div>
                </div>
              );
            })()}
            
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
              Silakan selesaikan pembayaran. Rincian invoice dan tautan QRIS telah siap. Notifikasi transaksi otomatis dikirim ke WhatsApp Anda (<strong>{customerPhone}</strong>).
            </p>

            {paymentData.invoiceUrl && (
              <a
                href={paymentData.invoiceUrl}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
              >
                <ArrowRight className="w-4 h-4" /> Buka Halaman Rincian Invoice
              </a>
            )}
          </div>
        )
        ) : (
          /* Form Data Pembeli (Ultra-Lean Single Section) */
          <form onSubmit={handleCheckout} className="space-y-4 text-xs">
            {/* Ringkasan Produk */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex justify-between font-bold text-white">
                <span className="line-clamp-1">{product.title}</span>
                <span className="text-emerald-400 shrink-0 ml-2">
                  Rp {basePrice.toLocaleString("id-ID")}
                </span>
              </div>
              {/* FIX: Elemen Reff hanya mount ke DOM jika affiliateCode
                  benar-benar ada dari URL aktif (?ref=...) saat ini.
                  Tenant biasa tanpa fitur affiliate tidak akan pernah
                  melihat teks ini — termasuk jika localStorage
                  mengandung sisa referral dari sesi testing sebelumnya. */}
              {affiliateCode && (
                <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1 pt-1">
                  <ShieldCheck className="w-3 h-3" /> Reff: {affiliateCode} (Komisi 30%: Rp {affiliateCommission.toLocaleString("id-ID")})
                </div>
              )}
            </div>

            {/* Slot Booking Card jika checkout membawa slot jadwal */}
            {product.slot && (
              <div className="bg-indigo-950/80 border border-indigo-500/40 rounded-2xl p-3.5 space-y-1 shadow-inner">
                <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-bold">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Jadwal Sesi Terpilih:</span>
                </div>
                <p className="text-white font-black text-sm">
                  {product.slot.displayLabel}
                </p>
                {product.slot.businessTopic && (
                  <p className="text-[11px] text-slate-300">
                    Topik: <span className="text-indigo-200 font-medium">{product.slot.businessTopic}</span>
                  </p>
                )}
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-[11px]">
                {errorMessage}
              </div>
            )}

            {/* Input Data Pembeli: Dynamic Context Fulfillment (Digital vs Fisik) */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Budi Pratama"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Nomor WhatsApp Aktif *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs font-mono"
                />
              </div>

              {/* JIKA DIGITAL: Tampilkan Email, Sembunyikan Seluruh Bagian Pengiriman */}
              {isDigital && (
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Alamat Email * (Untuk Pengiriman Akses)</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs"
                  />
                </div>
              )}

              {/* JIKA FISIK: Tampilkan Alamat Pengiriman, Kota/Kecamatan, dan Opsi Ongkir (Single Basic Courier) */}
              {isPhysical && (
                <>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Alamat Lengkap Pengiriman *</label>
                    <textarea
                      rows={2}
                      required
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Jl. Nama Jalan, No. Rumah, RT/RW, Kelurahan"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Kecamatan / Kota Tujuan *</label>
                    <input
                      type="text"
                      required
                      value={shippingCity}
                      onChange={(e) => setShippingCity(e.target.value)}
                      placeholder="Contoh: Sukasari, Kota Bandung"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      💡 Masukkan kecamatan/kota untuk kalkulasi otomatis ongkos kirim standar.
                    </span>
                  </div>

                  {/* Opsi Ongkir: Single Basic Courier */}
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-200">
                        <Truck className="w-4 h-4 text-emerald-400" />
                        <span>{shippingCourier}</span>
                      </div>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Reguler (2-3 hari)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                      <span>Tarif Pengiriman:</span>
                      <span className="font-bold text-white">
                        {isLoadingShipping ? (
                          <span className="text-blue-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Menghitung ongkir...
                          </span>
                        ) : shippingCost > 0 ? (
                          `Rp ${shippingCost.toLocaleString("id-ID")}`
                        ) : shippingCity.trim().length >= 3 ? (
                          "Rp 15.000"
                        ) : (
                          "Masukkan kota tujuan"
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Opsi Metode Pembayaran */}
            <div className="space-y-2 pt-1">
              <label className="text-slate-300 font-bold block">Pilih Cara Bayar</label>
              
              <label
                onClick={() => setPaymentMethod('qris')}
                className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition ${
                  paymentMethod === 'qris'
                    ? 'border-emerald-500 bg-emerald-950/30'
                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-950'
                }`}
              >
                <input
                  type="radio"
                  name="modal_payment_method"
                  checked={paymentMethod === 'qris'}
                  onChange={() => setPaymentMethod('qris')}
                  className="mt-1 text-emerald-500"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="font-bold text-white flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-emerald-400" /> QRIS Instan
                    </span>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      Bebas Biaya Admin / Paling Cepat
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Biaya admin Rp 0. Akses produk langsung aktif.</p>
                </div>
              </label>

              {bankAccounts.length > 0 && (
                <label
                  onClick={() => setPaymentMethod('manual_transfer')}
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition ${
                    paymentMethod === 'manual_transfer'
                      ? 'border-blue-500 bg-blue-950/30'
                      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-950'
                  }`}
                >
                  <input
                    type="radio"
                    name="modal_payment_method"
                    checked={paymentMethod === 'manual_transfer'}
                    onChange={() => setPaymentMethod('manual_transfer')}
                    className="mt-1 text-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-bold text-white flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-blue-400" /> Transfer Manual
                      </span>
                      <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        Bebas Biaya Admin + Kode Unik
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Transfer langsung ke rekening bank seller tanpa biaya admin dengan 3 digit kode verifikasi.</p>
                  </div>
                </label>
              )}
            </div>

            {/* Rincian Total */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1.5 text-slate-300">
              <div className="flex justify-between">
                <span>Harga Produk (Net)</span>
                <span>Rp {basePrice.toLocaleString("id-ID")}</span>
              </div>
              {isPhysical && (
                <div className="flex justify-between">
                  <span>Ongkos Kirim (Single Basic Courier)</span>
                  <span className={shippingCost > 0 ? "text-slate-200 font-semibold" : "text-slate-500"}>
                    {isLoadingShipping
                      ? "Menghitung..."
                      : shippingCost > 0
                      ? `Rp ${shippingCost.toLocaleString("id-ID")}`
                      : shippingCity.trim().length >= 3
                      ? "Rp 15.000"
                      : "Menunggu kota tujuan"}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Biaya Layanan & Admin</span>
                <span className="text-emerald-400 font-semibold">
                  Rp 0 (Bebas Biaya Admin)
                </span>
              </div>
              {paymentMethod === 'qris' && currentUniqueCode > 0 ? (
                <div className="flex justify-between text-emerald-400 font-medium">
                  <span>Potongan Kode Unik</span>
                  <span className="font-mono text-emerald-400 font-bold">-Rp {currentUniqueCode.toLocaleString("id-ID")}</span>
                </div>
              ) : paymentMethod === 'manual_transfer' ? (
                <div className="flex justify-between">
                  <span>Kode Unik Verifikasi</span>
                  <span className="font-mono text-blue-400">+{currentUniqueCode}</span>
                </div>
              ) : null}
              <div className="border-t border-slate-800 pt-1.5 flex justify-between font-bold text-white">
                <span>Total Pembayaran</span>
                <span className="text-emerald-400 text-sm">Rp {totalAmount.toLocaleString("id-ID")}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses Pesanan...</span>
                </>
              ) : (
                <>
                  <span>Bayar Sekarang (Rp {totalAmount.toLocaleString("id-ID")})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}