"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, QrCode, ArrowRight, Loader2, CheckCircle2, Building2, Lock, Copy, Check, MessageSquare, AlertTriangle, Download, ExternalLink, Package, Truck, Calendar, Zap, Upload, Image as ImageIcon, RefreshCw, Clock, Store, MapPin, Plus, Minus, Utensils } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createOrderAndInvoice } from "@/lib/checkout-service";
import { getActiveAffiliateCode, getTrackingData, getClientTrackingContext, trackLead, trackInitiateCheckout, trackClientPurchase, trackLeadFormSubmission, formatIndonesianWhatsAppNumber, initMetaPixel, initTikTokPixel } from "@/lib/tracking";
import { generateDynamicQRIS } from "@/lib/qris-dynamic";
import { getSupabase } from "@/lib/supabaseClient";
import { extractTenantBankAccounts, TenantBankAccount } from "@/lib/bank-accounts";
import { normalizeBriefingUrl } from "@/lib/product-catalog";
import { getStoreShippingConfig } from "@/lib/shipping/self-pickup";



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
    requires_shipping?: boolean;
    slug?: string;
    metadata?: any;
    fulfillment_metadata?: any;
    external_url?: string;
    cta_label?: string;
    meta_pixel_id_override?: string;
    tiktok_pixel_id_override?: string;
    items?: Array<any>;
    weight_grams?: number;
    cartId?: string | null;
    slot?: {
      slotDate: string;
      startTime: string;
      displayLabel: string;
      businessTopic: string;
    };
  } | null;
  checkoutContext?: any | null;
}

export default function CheckoutModal({ isOpen, onClose, tenantSlug, product, checkoutContext }: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [briefingUrl, setBriefingUrl] = useState("");
  const [kitchenNotes, setKitchenNotes] = useState("");
  const [foodDiningOption, setFoodDiningOption] = useState<'INSTANT' | 'PICKUP'>('INSTANT');
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingCourier, setShippingCourier] = useState("Kurir Dapur Instan (GoSend / GrabExpress)");
  const [courierServiceType, setCourierServiceType] = useState<'instant' | 'regular'>('instant');
  const [instantRate, setInstantRate] = useState<number>(20000);
  const [regularRate, setRegularRate] = useState<number>(15000);
  const [instantCourierName, setInstantCourierName] = useState<string>('Kurir Dapur Instan (GoSend / GrabExpress)');
  const [regularCourierName, setRegularCourierName] = useState<string>('Ekspedisi Reguler (J&T / SiCepat)');
  const [directWaUrl, setDirectWaUrl] = useState<string>('');
  const [isLoadingShipping, setIsLoadingShipping] = useState(false);
  const [quantity, setQuantity] = useState<number>(1);
  const maxQuantity = React.useMemo(() => {
    const stock = Number((product as any)?.stock ?? (product as any)?.stock_quantity ?? 99);
    return stock > 0 ? Math.min(stock, 99) : 99;
  }, [product]);

  const handleQuantityChange = (newQty: number) => {
    const clamped = Math.max(1, Math.min(newQty, maxQuantity));
    setQuantity(clamped);
  };

  const [fulfillmentType, setFulfillmentType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [selfPickupConfig, setSelfPickupConfig] = useState<{
    isEnabled: boolean;
    pickupAddress: string;
    pickupMapsUrl: string;
    pickupInstructions: string;
    storeName?: string;
  }>({
    isEnabled: false,
    pickupAddress: '',
    pickupMapsUrl: '',
    pickupInstructions: '',
  });
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
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofUploadFeedback, setProofUploadFeedback] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadProof = async (targetOrderId: string) => {
    if (!proofFile && !proofPreview) return;
    setIsUploadingProof(true);
    setProofUploadFeedback(null);
    try {
      const formData = new FormData();
      if (proofFile) {
        formData.append('file', proofFile);
      } else if (proofPreview) {
        formData.append('proof_base64', proofPreview);
      }
      formData.append('notes', 'Bukti transfer diunggah via modal checkout');

      const res = await fetch(`/api/orders/${encodeURIComponent(targetOrderId)}/payment-proof`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengunggah bukti transfer.');
      }

      setOrderStatus('WAITING_CONFIRMATION');
      setProofUploadFeedback('✅ Bukti transfer berhasil dikirim! Menunggu verifikasi penjual.');
    } catch (err: any) {
      setProofUploadFeedback(`❌ ${err.message || 'Gagal mengirim bukti transfer.'}`);
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Resolver Context Fulfillment Digital vs Fisik vs Food vs Booking/Service
  const rawProductType = (product?.product_type || product?.type || (product?.category === 'fisik' || product?.category === 'physical' ? 'physical' : 'digital')).toLowerCase();
  const rawCategory = (product?.category || '').toLowerCase();
  const isBookingOrService =
    rawProductType === 'service' ||
    rawProductType === 'booking' ||
    rawProductType === 'consultation' ||
    rawProductType === 'jasa' ||
    rawProductType === 'reservasi' ||
    Boolean(product?.slot);
  const isFood =
    !isBookingOrService &&
    (rawProductType === 'food' ||
    rawProductType === 'fnb' ||
    rawProductType.includes('food') ||
    rawProductType.includes('fnb') ||
    rawCategory.includes('food') ||
    rawCategory.includes('kuliner'));
  const isPhysical =
    !isBookingOrService &&
    (rawProductType === 'physical' ||
    rawProductType === 'fisik' ||
    rawProductType === 'food' ||
    rawProductType === 'fnb' ||
    isFood ||
    Boolean((product as any)?.requires_shipping) ||
    Boolean((product as any)?.requiresShipping));
  const isDigital = !isPhysical && !isBookingOrService;

  const handleCopy = (text: string, field: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const resolvedItems = checkoutContext?.items || (product as any)?.items || [];
  const isMultiItem = Array.isArray(resolvedItems) && resolvedItems.length > 1;
  const packageTotalWeight = checkoutContext?.totalWeightGrams || (product as any)?.weight_grams || 1000;
  const unitPrice = isMultiItem ? (checkoutContext?.subtotal || product?.price || 0) : (product?.price || 0);
  const productSubtotal = isMultiItem ? unitPrice : (unitPrice * quantity);
  const basePrice = productSubtotal;
  // Biaya admin Rp0 untuk QRIS maupun Transfer Manual (dana langsung masuk ke seller)
  const adminFee = 0;
  const isQris = paymentMethod === 'qris';
  const isPickup = isFood ? (foodDiningOption !== 'INSTANT') : (fulfillmentType === 'PICKUP');
  const currentUniqueCode = uniqueCode;
  const currentShippingCost = isFood
    ? (foodDiningOption === 'INSTANT' ? shippingCost : 0)
    : (isPhysical && !isPickup ? shippingCost : 0);
  const totalAmount = isQris
    ? Math.max(1000, basePrice + adminFee + currentShippingCost - currentUniqueCode)
    : basePrice + adminFee + currentUniqueCode + currentShippingCost;
  const affiliateCommission = 0; // Fitur affiliate produk ritel dinonaktifkan sementara (murni direct store)

  // Sinkronisasi Ongkos Kirim sesuai Layanan Kurir Terpilih (Instan vs Reguler)
  useEffect(() => {
    if (!isPhysical) {
      setShippingCost(0);
      return;
    }
    const hasCity = shippingCity.trim().length >= 3;
    if (courierServiceType === 'instant') {
      setShippingCost(hasCity ? instantRate : 0);
      setShippingCourier(instantCourierName);
    } else {
      setShippingCost(hasCity ? regularRate : 0);
      setShippingCourier(regularCourierName);
    }
  }, [courierServiceType, instantRate, regularRate, instantCourierName, regularCourierName, isPhysical, shippingCity]);

  // Resolusi Scarcity / Kuota Badge Dedikasi dari Metadata Produk
  const scarcityBadge = React.useMemo(() => {
    const raw =
      (product?.metadata as any)?.scarcity_badge ||
      (product?.fulfillment_metadata as any)?.scarcity_badge ||
      (product?.fulfillment_metadata?.single_page_config as any)?.scarcity_badge;

    if (raw) {
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        return trimmed ? { enabled: true, text: trimmed } : null;
      }
      if (typeof raw === 'object' && raw !== null) {
        if (raw.enabled === false) return null;
        const text = String(raw.text || '').trim();
        if (!text) return null;
        return { enabled: true, text };
      }
    }

    if (typeof (product as any)?.variants === 'string') {
      const parts = ((product as any).variants as string).split(/[•,]/).map((s) => s.trim());
      const scarcityPart = parts.find((p) => {
        const l = p.toLowerCase();
        return (
          l.includes('kuota terbatas') ||
          l.includes('seat kuota') ||
          l.includes('sisa seat') ||
          l.includes('kuota hanya')
        );
      });
      if (scarcityPart) {
        const cleanText = scarcityPart.startsWith('🔥') ? scarcityPart : `🔥 ${scarcityPart}`;
        return { enabled: true, text: cleanText };
      }
    }

    return null;
  }, [product]);

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
            weight_grams: packageTotalWeight,
            items: isMultiItem ? resolvedItems : undefined,
          }),
        });

        let foundInstant = false;
        let foundRegular = false;

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.rates) && data.rates.length > 0) {
            const instOpt = data.rates.find((r: any) =>
              r.type === 'instant' ||
              String(r.service || '').toLowerCase().includes('instant') ||
              String(r.courier_name || '').toLowerCase().includes('instan') ||
              String(r.courier_name || '').toLowerCase().includes('gosend') ||
              String(r.courier_name || '').toLowerCase().includes('grab')
            );
            if (instOpt) {
              setInstantRate(instOpt.price || 20000);
              setInstantCourierName(instOpt.courier_name || 'Kurir Dapur Instan (GoSend / GrabExpress)');
              foundInstant = true;
            }

            const regOpt = data.rates.find((r: any) =>
              r.type === 'regular' ||
              String(r.service || '').toLowerCase().includes('reguler') ||
              String(r.courier_name || '').toLowerCase().includes('j&t') ||
              String(r.courier_name || '').toLowerCase().includes('sicepat') ||
              String(r.courier_name || '').toLowerCase().includes('jne')
            );
            if (regOpt) {
              setRegularRate(regOpt.price || 15000);
              setRegularCourierName(regOpt.courier_name || 'Ekspedisi Reguler (J&T / SiCepat)');
              foundRegular = true;
            }
          }
        }

        if (!foundInstant) {
          setInstantRate(isFood ? 18000 : 25000);
          setInstantCourierName('Kurir Dapur Instan (GoSend / GrabExpress)');
        }
        if (!foundRegular) {
          setRegularRate(15000);
          setRegularCourierName('Ekspedisi Reguler (J&T / SiCepat)');
        }
      } catch (err) {
        console.warn('[CheckoutModal] Lazy shipping rate note:', err);
        setInstantRate(isFood ? 18000 : 25000);
        setRegularRate(15000);
      } finally {
        setIsLoadingShipping(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, isPhysical, shippingCity, tenantSlug, isFood]);

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

              const shippingCfg = await getStoreShippingConfig(tenantSlug, supabase).catch(() => null);
              if (shippingCfg) {
                setSelfPickupConfig({
                  isEnabled: Boolean(shippingCfg.is_self_pickup_enabled),
                  pickupAddress: shippingCfg.pickup_address || shippingCfg.origin_address || '',
                  pickupMapsUrl: shippingCfg.pickup_maps_url || '',
                  pickupInstructions: shippingCfg.pickup_operational_hours || shippingCfg.pickup_instructions || '',
                  storeName: data?.name || data?.metadata?.store_name || tenantSlug,
                });
              } else if (data?.metadata?.biteship_config) {
                const bCfg = data.metadata.biteship_config;
                setSelfPickupConfig({
                  isEnabled: Boolean(bCfg.is_self_pickup_enabled),
                  pickupAddress: bCfg.pickup_address || bCfg.origin_address || '',
                  pickupMapsUrl: bCfg.pickup_maps_url || '',
                  pickupInstructions: bCfg.pickup_operational_hours || bCfg.pickup_instructions || '',
                  storeName: data?.name || data?.metadata?.store_name || tenantSlug,
                });
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

  // Inisialisasi Browser Pixel & Trigger CAPI Event Lead saat user pertama kali memicu tombol paket
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

      // Event Lead: Saat user pertama kali memicu tombol paket / membuka modal pemesanan
      const leadEventId = `LEAD_${tenantSlug}_${product.id}_${Date.now()}`;
      trackLead(product.title, product.price || 0, leadEventId);

      // Trigger CAPI Lead (Non-blocking)
      try {
        const tracking = getTrackingData();
        fetch('/api/v1/tracking/capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug,
            eventName: 'Lead',
            eventId: leadEventId,
            amount: product.price || 0,
            currency: 'IDR',
            contentName: product.title,
            ctwa_clid: tracking.ctwa_clid,
            fbc: tracking.fbclid ? `fb.1.${Date.now()}.${tracking.fbclid}` : undefined,
          }),
        }).catch(() => {});
      } catch (_) {}
    }
  }, [isOpen, product, tenantMetaPixel, tenantTTPixel, tenantSlug]);

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

          // Trigger Event Purchase saat order terkonfirmasi PAID (Browser Pixel + Server CAPI)
          trackClientPurchase(paymentData.orderId, totalAmount, product?.title);

          try {
            const clientTracking = getClientTrackingContext();
            fetch('/api/v1/tracking/capi', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantSlug,
                eventName: 'Purchase',
                orderId: paymentData.orderId,
                eventId: `PURCHASE_${paymentData.orderId}`,
                amount: totalAmount,
                currency: 'IDR',
                customerPhone: customerPhone || undefined,
                customerName: customerName || undefined,
                customerEmail: customerEmail || undefined,
                fbp: clientTracking.fbp,
                fbc: clientTracking.fbc,
                userAgent: clientTracking.client_user_agent,
                contentName: product?.title || 'Pesanan Produk',
                contentIds: product?.id ? [String(product.id)] : undefined,
                contentType: 'product',
              }),
            }).catch(() => {});
          } catch (_) {}
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
      : isFood
      ? 'FOOD'
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

    const clientTrackingContext = getClientTrackingContext();

    const cleanBriefingUrl = (!isFood && isDigital) ? normalizeBriefingUrl(briefingUrl) : null;

    try {
      const result = await createOrderAndInvoice({
        tenantSlug,
        productId: product.id,
        productTitle: isMultiItem
          ? resolvedItems.map((i: any) => `${i.productTitle || i.title || i.name} (${i.quantity || 1}x)`).join(', ')
          : product.title,
        amount: totalAmount,
        basePrice: productSubtotal,
        unitPrice,
        quantity: isMultiItem
          ? resolvedItems.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
          : quantity,
        cartId: checkoutContext?.cartId || (product as any)?.cartId || null,
        items: isMultiItem
          ? resolvedItems.map((it: any) => ({
              productId: String(it.productId || it.product_id || it.id),
              productTitle: it.productTitle || it.title || it.name,
              unitPrice: Number(it.unitPrice || it.price || 0),
              quantity: Number(it.quantity || 1),
              weightGrams: Number(it.weightGrams || it.weight_grams || 0),
              variantId: it.variantId || it.variant_id || null,
              variantName: it.variantName || null,
              selectedModifiers: it.selectedModifiers || it.selected_modifiers || [],
            }))
          : undefined,
        adminFee,
        uniqueCode: currentUniqueCode,
        paymentMethod,
        affiliateCommission: 0,
        customerName,
        customerPhone,
        customerEmail: isDigital ? (customerEmail || undefined) : undefined,
        fulfillmentType: isPickup ? 'PICKUP' : 'DELIVERY',
        pickupInfo: isPickup ? {
          storeName: selfPickupConfig.storeName || tenantSlug,
          address: selfPickupConfig.pickupAddress,
          mapsUrl: selfPickupConfig.pickupMapsUrl,
          instructions: selfPickupConfig.pickupInstructions,
        } : undefined,
        shippingAddress: isFood
          ? (foodDiningOption === 'PICKUP'
              ? `[SELF-PICKUP] ${selfPickupConfig.pickupAddress || 'Ambil Sendiri di Resto'}`
              : shippingAddress)
          : isPhysical
          ? (isPickup ? `[SELF-PICKUP] ${selfPickupConfig.pickupAddress || 'Ambil Sendiri di Toko'}` : shippingAddress)
          : undefined,
        shippingCourier: isFood
          ? (foodDiningOption === 'PICKUP'
              ? 'Ambil Sendiri di Resto (Self-Pickup)'
              : shippingCourier)
          : isPhysical
          ? (isPickup ? 'Ambil Sendiri di Toko (Self-Pickup)' : shippingCourier)
          : undefined,
        shippingCost: isFood
          ? (foodDiningOption === 'INSTANT' ? shippingCost : 0)
          : (isPhysical && !isPickup ? shippingCost : 0),
        netShippingCost: isFood
          ? (foodDiningOption === 'INSTANT' ? shippingCost : 0)
          : (isPhysical && !isPickup ? shippingCost : 0),
        affiliateCode: undefined, // Murni direct store ke toko merchant
        tracking: trackingWithSlot,
        tracking_context: clientTrackingContext,
        productType: resolvedProductType,
        fulfillmentMetadata: {
          ...(resolvedFulfillmentMetadata || {}),
          ...(isFood ? {
            dining_option: foodDiningOption,
            kitchen_notes: kitchenNotes.trim() || undefined,
          } : {}),
        },
        briefing_url: cleanBriefingUrl || undefined,
        customer_briefing: cleanBriefingUrl ? {
          briefing_url: cleanBriefingUrl,
          submitted_at: new Date().toISOString(),
        } : undefined,
      });

      // Simpan IP Address dan context tracking sesi ke server backend Next.js
      if (result?.orderId) {
        fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: result.orderId,
            tracking_context: {
              ...clientTrackingContext,
              source_url: typeof window !== 'undefined' ? window.location.href : undefined,
            },
          }),
        }).catch(() => {});

        // Trigger Event InitiateCheckout saat QRIS PT atau payment link diterbitkan
        trackInitiateCheckout(product.title, totalAmount, `INITIATE_CHECKOUT_${result.orderId}`);
        trackLeadFormSubmission(totalAmount);

        // Dispatch Server-Side CAPI InitiateCheckout
        fetch('/api/v1/tracking/capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug,
            eventName: 'InitiateCheckout',
            eventId: `INITIATE_CHECKOUT_${result.orderId}`,
            orderId: result.orderId,
            amount: totalAmount,
            currency: 'IDR',
            customerPhone: customerPhone || undefined,
            customerName: customerName || undefined,
            customerEmail: customerEmail || undefined,
            fbp: clientTrackingContext.fbp,
            fbc: clientTrackingContext.fbc,
            userAgent: clientTrackingContext.client_user_agent,
            contentName: product.title,
          }),
        }).catch(() => {});

        // Dispatch sinyal pesanan resmi ke CS WhatsApp & Supabase Inbox Conversations
        fetch('/api/inbox/order-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: result.orderId,
            tenantSlug,
            customerName,
            customerPhone,
            productTitle: product.title,
            amount: totalAmount,
            shippingAddress: isPhysical ? shippingAddress : undefined,
            shippingCity: isPhysical ? shippingCity : undefined,
            shippingCourier: isPhysical ? shippingCourier : undefined,
            briefingUrl: cleanBriefingUrl || undefined,
            paymentMethod,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((sigData) => {
            if (sigData?.waUrl) {
              setDirectWaUrl(sigData.waUrl);
            }
          })
          .catch((sigErr) => console.warn('[Checkout] Order signal dispatch note:', sigErr));

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
          ) : orderStatus === 'WAITING_CONFIRMATION' ? (
            /* Tampilan Menunggu Verifikasi Penjual */
            <div className="bg-gradient-to-b from-amber-950/60 via-slate-900 to-slate-900 border-2 border-amber-500/70 rounded-3xl p-5 space-y-3.5 shadow-xl shadow-amber-950/40 text-xs text-left animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40">
                  <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-amber-400 bg-amber-950/90 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-amber-700/60 inline-block">
                    Bukti Transfer Terkirim
                  </span>
                  <h4 className="text-sm font-bold text-white">
                    Menunggu Verifikasi Mutasi Penjual
                  </h4>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Bukti pembayaran Anda telah berhasil kami kirimkan ke admin toko. Mutasi rekening sedang diverifikasi. Notifikasi verifikasi otomatis dikirim ke WhatsApp Anda.
              </p>
              {proofPreview && (
                <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 block">Lampiran Bukti Transfer:</span>
                  <img src={proofPreview} alt="Bukti Transfer" className="w-full h-auto max-h-36 object-cover rounded-lg border border-slate-700" />
                </div>
              )}
              {paymentData.invoiceUrl && (
                <a
                  href={paymentData.invoiceUrl}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <span>Buka Lembar Invoice Resmi #{paymentData.orderId}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              )}
            </div>
          ) : (
          /* Tampilan Menunggu Pembayaran (Transfer Bank Manual atau QRIS) */
          <div className="text-center space-y-4 py-3">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1 border border-slate-700 bg-slate-800 text-slate-300">
                {paymentData.paymentMethod === 'manual_transfer' ? (
                  <>
                    <Building2 className="w-3 h-3 text-blue-400" />
                    <span>Transfer Bank Manual</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-3 h-3 text-emerald-400" />
                    <span>QRIS Dinamis</span>
                  </>
                )}
              </div>
              <h4 className="font-bold text-white text-base">Pesanan Berhasil Dibuat!</h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Order ID: {paymentData.orderId}</p>
            </div>

            {/* Konten Metode Pembayaran */}
            {(() => {
              const cleanWa = formatIndonesianWhatsAppNumber(tenantPhone || '6281977655099');
              const isManual = paymentData.paymentMethod === 'manual_transfer';
              const draftConfirmMsg = `Halo Admin Toko, saya ingin konfirmasi pembayaran untuk:\n\n` +
                `Order ID: ${paymentData.orderId}\n` +
                `Produk: ${product.title}\n` +
                `Nama: ${customerName || '-'}\n` +
                `Total Nominal: Rp ${totalAmount.toLocaleString('id-ID')}\n` +
                `Metode: ${isManual ? 'Transfer Bank Manual' : 'QRIS Dinamis'}\n\n` +
                `📸 Saya lampirkan foto/screenshot bukti transfer di chat ini ya Kak agar langsung dicek dan diverifikasi oleh sistem. Terima kasih! 🙏`;

              const waConfirmUrl = directWaUrl || `https://wa.me/${cleanWa}?text=${encodeURIComponent(draftConfirmMsg)}`;

              if (isManual) {
                return (
                  <div className="space-y-3 text-left">
                    {/* Rekening Tujuan Box */}
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-blue-400" />
                          <span>Rekening Tujuan Pembayaran</span>
                        </span>
                        <span className="text-[10px] text-blue-400 font-mono bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                          Bebas Biaya Admin
                        </span>
                      </div>

                      {/* Total Nominal Transfer dengan Salin Nominal 1-Klik */}
                      <div className="flex items-center justify-between p-3 bg-slate-900/90 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Total Nominal Transfer:</span>
                          <span className="text-base font-black text-emerald-400 font-mono">
                            Rp {totalAmount.toLocaleString('id-ID')}
                          </span>
                          {currentUniqueCode > 0 && (
                            <span className="text-[10px] text-blue-400 block font-mono">
                              (Termasuk 3 digit kode unik: +{currentUniqueCode})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(String(totalAmount), 'amount_top')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          {copiedField === 'amount_top' || copiedField === 'amount' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Nominal Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Nominal</span>
                            </>
                          )}
                        </button>
                      </div>

                      {bankAccounts.length > 0 ? (
                        <div className="space-y-2">
                          {bankAccounts.map((acc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                              <div>
                                <span className="text-[10px] font-bold text-blue-400 block">{acc.bank_name}</span>
                                <span className="font-mono font-bold text-white text-xs">{acc.account_number}</span>
                                <span className="text-[10px] text-slate-400 block">a/n {acc.account_holder}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(acc.account_number, `bank_${idx}`)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                {copiedField === `bank_${idx}` ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">Rekening Tersalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Salin Rekening</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                          Rekening transfer toko sedang disiapkan. Anda dapat langsung konfirmasi via WhatsApp.
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // QRIS Rendering
              const candidateQris = (paymentData.qr_string?.startsWith('000201') || paymentData.qrString?.startsWith('000201'))
                ? (paymentData.qr_string || paymentData.qrString)
                : tenantStaticQris;
              const candidateQrImage =
                paymentData.qrCodeUrl ||
                paymentData.qr_code_url ||
                (paymentData.qr_string && (paymentData.qr_string.startsWith('http://') || paymentData.qr_string.startsWith('https://')) ? paymentData.qr_string : '') ||
                tenantQrisImageUrl ||
                '';

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
                  <div className="mt-2 pt-2 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Nominal Terkunci:</span>
                      <span className="font-extrabold text-emerald-700 text-sm">Rp {totalAmount.toLocaleString('id-ID')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(String(totalAmount), 'amount')}
                      className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'amount' || copiedField === 'amount_top' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span>Nominal Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin Nominal</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : candidateQrImage ? (
                <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center my-2 shadow-inner">
                  <div className="p-2.5 bg-white rounded-xl flex items-center justify-center max-w-[240px]">
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
                  <div className="mt-2 pt-2 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Total Nominal:</span>
                      <span className="font-extrabold text-emerald-700 text-sm">Rp {totalAmount.toLocaleString('id-ID')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(String(totalAmount), 'amount')}
                      className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'amount' || copiedField === 'amount_top' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span>Nominal Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin Nominal</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-2xl p-4 text-center space-y-2 my-2">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                  <p className="text-xs text-amber-300 font-medium">
                    Metode pembayaran QRIS toko belum dikonfigurasi. Silakan gunakan transfer manual atau hubungi pemilik toko.
                  </p>
                </div>
              );

              return (
                <div className="space-y-3">
                  {qrContainer}

                  {/* Alternatif Transfer Manual jika tersedia */}
                  {bankAccounts.length > 0 && (
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-left text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-400" /> Alternatif Transfer Manual
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Bebas Biaya</span>
                      </div>
                      <div className="space-y-2">
                        {bankAccounts.map((acc, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-900 rounded-xl border border-slate-800">
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
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Upload Bukti Transfer Box & WhatsApp Fallback */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 text-left text-xs shadow-lg">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Unggah Bukti Pembayaran</span>
                </span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40">
                  Verifikasi Cepat
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                📸 Setelah melakukan transfer atau pembayaran QRIS, silakan unggah foto/screenshot bukti transfer di bawah ini agar langsung diverifikasi oleh sistem.
              </p>

              <div className="space-y-2.5">
                <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500/70 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-slate-900/60 transition group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {proofPreview ? (
                    <div className="flex flex-col items-center gap-2">
                      <img
                        src={proofPreview}
                        alt="Preview Bukti"
                        className="w-24 h-24 object-cover rounded-lg border border-slate-700 shadow-md"
                      />
                      <span className="text-[10px] text-emerald-400 font-semibold group-hover:underline">
                        Ganti foto bukti transfer
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 py-1.5">
                      <ImageIcon className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 transition" />
                      <span className="text-xs font-semibold text-slate-200">
                        Pilih Foto / Screenshot Struk Pembayaran
                      </span>
                      <span className="text-[9px] text-slate-400">
                        Format JPG, PNG, atau WEBP (Maks 10MB)
                      </span>
                    </div>
                  )}
                </label>

                {proofUploadFeedback && (
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-semibold text-center text-slate-200">
                    {proofUploadFeedback}
                  </div>
                )}

                {/* Tombol Utama Unggah Bukti */}
                {proofPreview && (
                  <button
                    type="button"
                    onClick={() => handleUploadProof(paymentData.orderId)}
                    disabled={isUploadingProof}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/30 cursor-pointer active:scale-95"
                  >
                    {isUploadingProof ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Mengirim Bukti Transfer...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Unggah Bukti Transfer Sekarang</span>
                      </>
                    )}
                  </button>
                )}

                {/* Tombol Sekunder Fallback WhatsApp */}
                <a
                  href={directWaUrl || `https://wa.me/${formatIndonesianWhatsAppNumber(tenantPhone || '6281977655099')}?text=${encodeURIComponent(
                    `Halo Admin Toko, saya ingin konfirmasi pembayaran untuk:\n\nOrder ID: ${paymentData.orderId}\nProduk: ${product.title}\nNama: ${customerName || '-'}\nTotal Nominal: Rp ${totalAmount.toLocaleString('id-ID')}\nMetode: ${paymentData.paymentMethod === 'manual_transfer' ? 'Transfer Bank Manual' : 'QRIS Dinamis'}\n\n📸 Saya lampirkan foto/screenshot bukti transfer di chat ini ya Kak agar langsung dicek dan diverifikasi oleh sistem. Terima kasih! 🙏`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-600/50 text-slate-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Kirim Bukti via WhatsApp (Alternatif Chat)</span>
                </a>
              </div>
            </div>

            {paymentData.invoiceUrl && (
              <a
                href={paymentData.invoiceUrl}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
              >
                <span>Buka Lembar Invoice Resmi #{paymentData.orderId}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
          </div>
        )
        ) : (
          /* Form Data Pembeli (Ultra-Lean Single Section) */
          <form onSubmit={handleCheckout} className="space-y-4 text-xs">
            {/* Ringkasan Produk & Paket */}
            {isMultiItem ? (
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-white border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Package className="w-4 h-4" />
                    <span>Paket Belanja ({resolvedItems.length} Produk)</span>
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">{packageTotalWeight} gr</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {resolvedItems.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-slate-900/60 last:border-0">
                      <div className="truncate mr-2">
                        <span className="text-slate-200 font-medium">{it.productTitle || it.title || it.name}</span>
                        <span className="text-emerald-400 font-bold ml-1.5">x{it.quantity}</span>
                        {it.selectedModifiers && it.selectedModifiers.length > 0 && (
                          <span className="text-[10px] text-amber-400/90 block">
                            {it.selectedModifiers.map((m: any) => m.option_name || m.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <span className="text-slate-300 font-bold shrink-0">
                        Rp {((it.unitPrice || it.price) * it.quantity).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs font-bold text-white">
                  <span className="text-slate-300">Subtotal Produk:</span>
                  <span className="text-emerald-400 font-mono font-black">
                    Rp {productSubtotal.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-start font-bold text-white">
                  <span className="line-clamp-1">{product?.title || ''}</span>
                  <span className="text-emerald-400 shrink-0 ml-2">
                    Rp {unitPrice.toLocaleString("id-ID")}
                  </span>
                </div>

                {/* Kontrol Pemilihan Kuantiti / Stepper (- [ Qty ] +) */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-300 block">Jumlah Kuantiti:</span>
                    {quantity > 1 && (
                      <span className="text-[10px] text-slate-400">
                        Subtotal: <strong className="text-emerald-400 font-mono">Rp {productSubtotal.toLocaleString("id-ID")}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity - 1)}
                      disabled={quantity <= 1}
                      aria-label="Kurangi Jumlah"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm transition cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxQuantity}
                      value={quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) handleQuantityChange(val);
                      }}
                      className="w-10 text-center font-bold text-xs text-white bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity + 1)}
                      disabled={quantity >= maxQuantity}
                      aria-label="Tambah Jumlah"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

              {affiliateCode && (
                <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1 pt-1">
                  <ShieldCheck className="w-3 h-3" /> Reff: {affiliateCode} (Komisi 30%: Rp {affiliateCommission.toLocaleString("id-ID")})
                </div>
              )}

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

              {/* JIKA DIGITAL: Tampilkan Email Wajib, JIKA FISIK/KULINER: Tampilkan Email Opsional */}
              {isDigital ? (
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
              ) : (
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">
                    Alamat Email <span className="text-slate-500 font-normal text-[11px]">(Opsional - notifikasi order via WhatsApp)</span>
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 text-sm md:text-xs"
                  />
                </div>
              )}

              {/* INPUT BRIEFING LINK (Google Docs / Drive / Notion) - HANYA UNTUK DIGITAL / SERVICE */}
              {!isFood && isDigital && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-medium">Link Dokumen Briefing (Opsional)</label>
                    <span className="text-[10px] text-slate-500">Google Docs / Notion / Drive</span>
                  </div>
                  <input
                    type="text"
                    value={briefingUrl}
                    onChange={(e) => setBriefingUrl(e.target.value)}
                    placeholder="Contoh: docs.google.com/document/d/... atau notion.so/..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    💡 Cantumkan link referensi, materi, atau brief kampanye. Protokol https:// otomatis ditambahkan jika terlewat.
                  </span>
                </div>
              )}

              {/* CATATAN KHUSUS DAPUR / ALERGI (HANYA PRODUK KULINER/FOOD) */}
              {isFood && (
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Catatan Khusus Dapur / Alergi (Opsional)</label>
                  <textarea
                    rows={2}
                    value={kitchenNotes}
                    onChange={(e) => setKitchenNotes(e.target.value)}
                    placeholder="Contoh: Sambal dipisah, level pedas sedang, tanpa daun bawang/alergi udang..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 text-sm md:text-xs"
                  />
                </div>
              )}

              {/* ── METODE PENGANTARAN / PENYAJIAN MAKANAN (PRESET FOOD) ── */}
              {isFood && (
                <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-emerald-500/40 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-100 text-xs">
                      <Utensils className="w-4 h-4 text-emerald-400" />
                      <span>Opsi Layanan &amp; Pengantaran Menu</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      {foodDiningOption === 'INSTANT' ? '⚡ Kurir Instan' : '🏪 Ambil di Resto'}
                    </span>
                  </div>

                  <div className="p-1 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setFoodDiningOption('INSTANT'); setCourierServiceType('instant'); }}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        foodDiningOption === 'INSTANT'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Kurir Instan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFoodDiningOption('PICKUP')}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        foodDiningOption === 'PICKUP'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Store className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Ambil di Resto</span>
                    </button>
                  </div>

                  {/* Opsi 2: Ambil di Resto (Pickup) */}
                  {foodDiningOption === 'PICKUP' && (
                    <div className="bg-slate-950 rounded-xl p-3 border border-emerald-500/40 text-xs space-y-1.5">
                      <div className="font-bold text-slate-100 text-xs">
                        Lokasi Resto: {selfPickupConfig.storeName || tenantSlug}
                      </div>
                      <p className="text-slate-300 text-xs">{selfPickupConfig.pickupAddress || 'Resto / Dapur Utama'}</p>
                      {selfPickupConfig.pickupInstructions && (
                        <p className="text-slate-400 text-[11px]">⏰ {selfPickupConfig.pickupInstructions}</p>
                      )}
                      {selfPickupConfig.pickupMapsUrl && (
                        <div className="pt-0.5">
                          <a
                            href={selfPickupConfig.pickupMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-400" />
                            <span>Buka Petunjuk Arah (Google Maps)</span>
                            <ExternalLink className="w-3 h-3 text-blue-400" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Opsi 3: Kurir Instan (GoSend / Grab) */}
                  {foodDiningOption === 'INSTANT' && (
                    <div className="space-y-2.5 pt-0.5">
                      <div className="space-y-1">
                        <label className="text-slate-400 font-medium">Alamat Pengantaran Instan *</label>
                        <textarea
                          rows={2}
                          required={foodDiningOption === 'INSTANT'}
                          value={shippingAddress}
                          onChange={(e) => setShippingAddress(e.target.value)}
                          placeholder="Jl. Nama Jalan, No. Rumah, RT/RW, Patokan jelas..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-400 font-medium">Kecamatan / Kota Tujuan *</label>
                        <input
                          type="text"
                          required={foodDiningOption === 'INSTANT'}
                          value={shippingCity}
                          onChange={(e) => setShippingCity(e.target.value)}
                          placeholder="Contoh: Sukasari, Kota Bandung"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                        />
                      </div>

                      {/* Kurir Instan Only */}
                      <div className="p-3 rounded-2xl border border-emerald-500 bg-emerald-950/30">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-slate-200">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span>Kurir Dapur Instan</span>
                          </div>
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
                            Hari Ini (1-2 Jam)
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {instantCourierName} (GoSend / Grab)
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1.5 mt-1 border-t border-slate-900">
                          <span>Ongkir:</span>
                          <span className="font-bold text-white">
                            {isLoadingShipping ? (
                              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                            ) : instantRate > 0 ? (
                              `Rp ${instantRate.toLocaleString("id-ID")}`
                            ) : shippingCity.trim().length >= 3 ? (
                              "Rp 20.000"
                            ) : (
                              "-"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── METODE PENGIRIMAN PRODUK FISIK NON-FOOD ── */}
              {!isFood && isPhysical && (
                <>
                  {/* Opsi Tab: Ekspedisi vs Ambil Sendiri */}
                  {selfPickupConfig.isEnabled && (
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl mb-1">
                      <button
                        type="button"
                        onClick={() => setFulfillmentType('DELIVERY')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          fulfillmentType === 'DELIVERY'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Kirim via Kurir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFulfillmentType('PICKUP')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          fulfillmentType === 'PICKUP'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        <span>Ambil di Toko (Gratis)</span>
                      </button>
                    </div>
                  )}

                  {fulfillmentType === 'PICKUP' ? (
                    <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-emerald-500/40 text-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                            <Store className="w-4 h-4" />
                          </div>
                          <div>
                            <h5 className="font-bold text-slate-100 text-xs">Lokasi Pengambilan Toko:</h5>
                            <p className="text-[11px] font-semibold text-emerald-400">
                              {selfPickupConfig.storeName || tenantSlug}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Bebas Ongkir
                        </span>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1 text-slate-300">
                        <div className="font-medium text-slate-100">
                          {selfPickupConfig.pickupAddress || 'Alamat toko utama merchant'}
                        </div>
                        {selfPickupConfig.pickupInstructions && (
                          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                            <span className="font-bold text-slate-300">⏰ Jam Operasional: </span>
                            {selfPickupConfig.pickupInstructions}
                          </div>
                        )}
                      </div>

                      {selfPickupConfig.pickupMapsUrl && (
                        <a
                          href={selfPickupConfig.pickupMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          <MapPin className="w-3.5 h-3.5 text-blue-400" />
                          <span>Buka Petunjuk Arah (Google Maps)</span>
                          <ExternalLink className="w-3 h-3 text-blue-400" />
                        </a>
                      )}

                      <p className="text-[10px] text-slate-500 italic">
                        * Cukup isi Nama &amp; No. WhatsApp Anda di atas untuk verifikasi serah terima barang di toko.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <label className="text-slate-400 font-medium">Alamat Lengkap Pengiriman *</label>
                        <textarea
                          rows={2}
                          required={fulfillmentType === 'DELIVERY'}
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
                          required={fulfillmentType === 'DELIVERY'}
                          value={shippingCity}
                          onChange={(e) => setShippingCity(e.target.value)}
                          placeholder="Contoh: Sukasari, Kota Bandung"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs"
                        />
                        <span className="text-[10px] text-slate-500 block">
                          💡 Masukkan kecamatan/kota untuk kalkulasi otomatis ongkos kirim standar.
                        </span>
                      </div>

                      {/* Opsi Ongkir: Instant vs Regular Courier (Produk Fisik Non-Food) */}
                      <div className="space-y-2">
                        <label className="text-slate-300 font-bold block">Pilih Opsi Pengiriman</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {/* Kurir Dapur Instan */}
                          <div
                            onClick={() => setCourierServiceType('instant')}
                            className={`p-3 rounded-2xl border cursor-pointer transition ${
                              courierServiceType === 'instant'
                                ? 'border-emerald-500 bg-emerald-950/30'
                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                                <Zap className="w-4 h-4 text-amber-400" />
                                <span>Kurir Dapur Instan</span>
                              </div>
                              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                Hari Ini (1-2 Jam)
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {instantCourierName} (GoSend / Grab)
                            </p>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1.5 mt-1 border-t border-slate-900">
                              <span>Ongkir:</span>
                              <span className="font-bold text-white">
                                {isLoadingShipping ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                                ) : instantRate > 0 ? (
                                  `Rp ${instantRate.toLocaleString("id-ID")}`
                                ) : shippingCity.trim().length >= 3 ? (
                                  "Rp 20.000"
                                ) : (
                                  "-"
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Ekspedisi Reguler */}
                          <div
                            onClick={() => setCourierServiceType('regular')}
                            className={`p-3 rounded-2xl border cursor-pointer transition ${
                              courierServiceType === 'regular'
                                ? 'border-emerald-500 bg-emerald-950/30'
                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                                <Truck className="w-4 h-4 text-emerald-400" />
                                <span>Ekspedisi Reguler</span>
                              </div>
                              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                2-3 Hari
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {regularCourierName} (J&T / SiCepat / Anteraja)
                            </p>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1.5 mt-1 border-t border-slate-900">
                              <span>Ongkir:</span>
                              <span className="font-bold text-white">
                                {isLoadingShipping ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                                ) : regularRate > 0 ? (
                                  `Rp ${regularRate.toLocaleString("id-ID")}`
                                ) : shippingCity.trim().length >= 3 ? (
                                  "Rp 15.000"
                                ) : (
                                  "-"
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
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
                fulfillmentType === 'PICKUP' ? (
                  <div className="flex justify-between text-emerald-400">
                    <span className="flex items-center gap-1 font-medium">
                      <Store className="w-3.5 h-3.5" />
                      <span>Pengambilan (Ambil di Toko)</span>
                    </span>
                    <span className="font-bold">Rp 0 (Gratis)</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span>Ongkos Kirim ({courierServiceType === 'instant' ? 'Kurir Instan' : 'Ekspedisi Reguler'})</span>
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
                )
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
                  <span>
                    {isFood
                      ? `Pesan Sekarang (Rp ${totalAmount.toLocaleString("id-ID")})`
                      : isPhysical
                      ? `Konfirmasi & Lanjut ke WhatsApp / QRIS (Rp ${totalAmount.toLocaleString("id-ID")})`
                      : `Bayar Sekarang (Rp ${totalAmount.toLocaleString("id-ID")})`}
                  </span>
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