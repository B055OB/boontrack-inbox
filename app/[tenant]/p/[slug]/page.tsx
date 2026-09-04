'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { 
  Check, 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  Loader2, 
  QrCode, 
  Building2, 
  Sparkles, 
  X,
  Tag,
  Truck,
  Package,
  CheckCircle2,
  AlertCircle,
  Trash2,
  XCircle,
  AlertTriangle,
  Gift,
  Star,
  ArrowDown,
  Scale,
  Flame,
  Zap,
  MessageCircle
} from 'lucide-react';
import { syncAttributionSession } from '@/lib/attribution';
import { 
  initMetaPixel, 
  initTikTokPixel, 
  trackViewContent, 
  trackAddToCart,
  trackInitiateCheckout,
  trackAddPaymentInfo,
  trackWhatsAppConsultation,
  trackClientPurchase,
  getActiveAffiliateCode,
  getTrackingData
} from '@/lib/tracking';
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { resolveSinglePageProduct, SinglePageConfig, ProductItem, VoucherConfig, ComparisonItem, BonusItem } from '@/lib/product-catalog';

function SingleProductContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenant = (params.tenant as string) || 'onlineboost';
  const slug = (params.slug as string) || 'masterclass-ads-2026';

  // Resolusi Produk & Konfigurasi Dinamis dari Dasbor
  const [resolvedData, setResolvedData] = useState<{ product: ProductItem; config: SinglePageConfig }>(() => 
    resolveSinglePageProduct(tenant, slug)
  );

  useEffect(() => {
    // Sinkronisasi data dinamis dari localStorage jika baru diperbarui di Dasbor
    const dynamicData = resolveSinglePageProduct(tenant, slug);
    setResolvedData(dynamicData);
  }, [tenant, slug]);

  const product = resolvedData.product;
  const config = resolvedData.config;

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');

  // Default metode pembayaran sesuai konfigurasi yang diaktifkan
  const allowQris = config.enable_qris ?? true;
  const allowManual = config.enable_manual_transfer ?? true;

  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'manual_transfer'>(() => {
    if (allowQris) return 'qris';
    if (allowManual) return 'manual_transfer';
    return 'qris';
  });

  useEffect(() => {
    if (!allowQris && allowManual) {
      setPaymentMethod('manual_transfer');
    } else if (allowQris && !allowManual) {
      setPaymentMethod('qris');
    }
  }, [allowQris, allowManual]);

  const [uniqueCode] = useState(() => Math.floor(100 + Math.random() * 900));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [affiliateCode, setAffiliateCode] = useState<string | undefined>(undefined);

  // Deteksi Tipe Produk & Pengiriman (Khusus Produk Fisik)
  const isPhysical = product.category === 'fisik';
  const BASE_SHIPPING_OPTIONS = [
    { id: 'reg', name: 'J&T / SiCepat Regular', price: 20000, eta: '2-3 hari', type: 'regular', badge: 'Reguler' },
    { id: 'exp', name: 'Kurir Express Next Day', price: 35000, eta: '1 hari', type: 'express', badge: 'Express' },
    { id: 'cargo', name: 'Kargo Hemat', price: 15000, eta: '4-5 hari', type: 'cargo', badge: 'Kargo' }
  ];
  const [instantCouriers, setInstantCouriers] = useState<any[]>([]);
  const [isLoadingInstant, setIsLoadingInstant] = useState(false);
  const [selectedShippingId, setSelectedShippingId] = useState<string>('reg');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [shippingCity, setShippingCity] = useState<string>('');

  const availableShippingOptions = useMemo(() => {
    return [...BASE_SHIPPING_OPTIONS, ...instantCouriers];
  }, [instantCouriers]);

  // Efek pemanggilan tarif instan Biteship saat pembeli memasukkan kota Bandung atau kode pos 40xxx
  useEffect(() => {
    if (!isPhysical) return;

    const queryCity = shippingCity.trim();
    const queryAddress = shippingAddress.trim();

    const hasBandungOrPostal = 
      queryCity.toLowerCase().includes('bandung') ||
      queryAddress.toLowerCase().includes('bandung') ||
      /\b40\d{3}\b/.test(queryCity) ||
      /\b40\d{3}\b/.test(queryAddress);

    if (!hasBandungOrPostal) {
      if (instantCouriers.length > 0) {
        setInstantCouriers([]);
        if (selectedShippingId.startsWith('biteship_')) {
          setSelectedShippingId('reg');
        }
      }
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoadingInstant(true);
      try {
        const res = await fetch('/api/v1/shipping/rates/instant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination_city: queryCity,
            destination_address: queryAddress,
            destination_postal_code: (queryCity.match(/\b40\d{3}\b/) || queryAddress.match(/\b40\d{3}\b/) || [''])[0]
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.couriers) && data.couriers.length > 0) {
            setInstantCouriers(data.couriers);
          } else {
            setInstantCouriers([]);
          }
        }
      } catch (err) {
        console.warn('[Rates Instant Error]', err);
      } finally {
        setIsLoadingInstant(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [isPhysical, shippingCity, shippingAddress]);

  // Modul Voucher Diskon Fleksibel
  const initialVoucher: VoucherConfig | null = config.voucher || (config.discount_coupon ? {
    code: config.discount_coupon,
    discount_type: 'nominal',
    discount_value: 20000,
    shipping_discount_type: isPhysical ? 'free' : 'none',
    shipping_discount_value: 0,
    min_spend: 0
  } : null);

  const [voucherInput, setVoucherInput] = useState(initialVoucher?.code || '');
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherConfig | null>(initialVoucher);
  const [voucherMsg, setVoucherMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(() => {
    if (initialVoucher) {
      return {
        type: 'success',
        text: `Voucher ${initialVoucher.code} berhasil diterapkan otomatis!`
      };
    }
    return null;
  });

  const handleApplyVoucher = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = voucherInput.trim().toUpperCase();
    if (!code) {
      setVoucherMsg({ type: 'error', text: 'Silakan masukkan kode voucher.' });
      return;
    }

    const currentBasePrice = product.price || 99000;

    // Cek kecocokan kode voucher
    const targetVoucher: VoucherConfig | null = 
      (config.voucher && config.voucher.code.toUpperCase() === code)
        ? config.voucher
        : (config.discount_coupon && config.discount_coupon.toUpperCase() === code)
        ? {
            code: config.discount_coupon.toUpperCase(),
            discount_type: 'nominal',
            discount_value: 20000,
            shipping_discount_type: isPhysical ? 'free' : 'none',
            shipping_discount_value: 0,
            min_spend: 0
          }
        : (code === 'HEMAT50' || code === 'DISKON20K' || code === 'FREESHIP' || code === 'BOONPROMO50')
        ? {
            code,
            discount_type: code === 'DISKON20K' ? 'percentage' : 'nominal',
            discount_value: code === 'DISKON20K' ? 20 : 50000,
            shipping_discount_type: code === 'FREESHIP' ? 'free' : 'none',
            shipping_discount_value: 0,
            min_spend: 0
          }
        : null;

    if (!targetVoucher) {
      setVoucherMsg({ type: 'error', text: `Voucher "${code}" tidak valid atau telah kedaluwarsa.` });
      setAppliedVoucher(null);
      return;
    }

    // Validasi minimal belanja
    if (targetVoucher.min_spend && currentBasePrice < targetVoucher.min_spend) {
      setVoucherMsg({
        type: 'error',
        text: `Minimal belanja Rp ${targetVoucher.min_spend.toLocaleString('id-ID')} untuk menggunakan voucher ini.`
      });
      setAppliedVoucher(null);
      return;
    }

    setAppliedVoucher(targetVoucher);
    setVoucherMsg({
      type: 'success',
      text: `Voucher ${targetVoucher.code} berhasil digunakan!`
    });
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null);
    setVoucherInput('');
    setVoucherMsg(null);
  };

  // Perhitungan Finansial Presisi
  const basePrice = product.price || 99000;
  const promoPrice = product.promo_price || (basePrice > 100000 ? Math.round(basePrice * 1.5) : 499000);

  // 1. Potongan Diskon Produk (Nominal / Persen)
  let productDiscount = 0;
  if (appliedVoucher) {
    if (appliedVoucher.discount_type === 'percentage') {
      productDiscount = Math.round(basePrice * ((appliedVoucher.discount_value || 0) / 100));
    } else {
      productDiscount = appliedVoucher.discount_value || 0;
    }
  }
  productDiscount = Math.min(productDiscount, basePrice);
  const netProductPrice = Math.max(0, basePrice - productDiscount);

  // 2. Ongkos Kirim & Subsidi (Khusus Produk Fisik)
  const selectedShipping = availableShippingOptions.find(s => s.id === selectedShippingId) || availableShippingOptions[0];
  const baseShippingCost = isPhysical ? selectedShipping.price : 0;
  let shippingSubsidy = 0;
  if (isPhysical && appliedVoucher) {
    if (appliedVoucher.shipping_discount_type === 'free') {
      shippingSubsidy = baseShippingCost;
    } else if (appliedVoucher.shipping_discount_type === 'flat') {
      shippingSubsidy = Math.min(baseShippingCost, appliedVoucher.shipping_discount_value || 0);
    }
  }
  const netShippingCost = Math.max(0, baseShippingCost - shippingSubsidy);

  // 3. Biaya Admin = Rp 0 & Kode Unik Verifikasi
  const adminFee = 0;
  const currentUniqueCode = paymentMethod === 'manual_transfer' ? uniqueCode : 0;

  // 4. Total Bayar Presisi
  const totalAmount = netProductPrice + netShippingCost + currentUniqueCode;

  // 5. Komisi Affiliate (Fitur affiliate produk retail toko dinonaktifkan sementara: murni direct store ke merchant)
  const commissionRate = 0;
  const affiliateCommission = 0;

  // 6. Total Nilai Bonus Eksklusif
  const totalBonusValue = useMemo(() => {
    if (!config.bonus_items || config.bonus_items.length === 0) return 0;
    return config.bonus_items.reduce((acc, item) => acc + (item.value || 0), 0);
  }, [config.bonus_items]);

  useEffect(() => {
    // 1. Rekam jejak atribusi referral & parameter UTM/Click ID
    syncAttributionSession(tenant, searchParams);

    // 2. Inisialisasi Meta & TikTok Pixel (Demo / Tenant Config ID)
    initMetaPixel('123456789012345');
    initTikTokPixel('C1234567890ABCDE');

    // 3. Dispatch event ViewContent saat landing page dimuat
    trackViewContent({
      id: slug,
      name: product.name,
      price: basePrice
    });

    const activeRef = getActiveAffiliateCode();
    if (activeRef) {
      setAffiliateCode(activeRef);
    }
  }, [tenant, searchParams, slug, product.name, basePrice]);

  // ── TRACKING 2 JALUR: DIRECT CHECKOUT (FULL FUNNEL) & WHATSAPP CONSULTATION ──
  const [hasTrackedAddToCart, setHasTrackedAddToCart] = useState(false);
  const [hasTrackedInitiateCheckout, setHasTrackedInitiateCheckout] = useState(false);
  const [hasTrackedPaymentInfo, setHasTrackedPaymentInfo] = useState(false);

  const triggerAddToCart = () => {
    if (!hasTrackedAddToCart) {
      trackAddToCart({
        id: slug,
        name: product.name,
        price: basePrice
      });
      setHasTrackedAddToCart(true);
    }
  };

  const triggerInitiateCheckout = () => {
    if (!hasTrackedInitiateCheckout) {
      trackInitiateCheckout({
        id: slug,
        name: product.name,
        price: basePrice
      });
      setHasTrackedInitiateCheckout(true);
    }
  };

  const triggerAddPaymentInfo = (method?: string) => {
    if (!hasTrackedPaymentInfo) {
      trackAddPaymentInfo({
        name: product.name,
        price: totalAmount,
        paymentMethod: method || paymentMethod
      });
      setHasTrackedPaymentInfo(true);
    }
  };

  // Prefill Pesan WhatsApp: "Halo [Nama Toko], saya sedang melihat produk [Nama Produk] di website dan mau tanya detailnya."
  const storeDisplayName = (tenant.charAt(0).toUpperCase() + tenant.slice(1));
  const waConsultationMessage = `Halo ${storeDisplayName}, saya sedang melihat produk ${product.name} di website dan mau tanya detailnya.`;
  const csWaNumber = (config.whatsapp_number || '6281237450222').replace(/\D/g, '');
  const waConsultationUrl = `https://wa.me/${csWaNumber}?text=${encodeURIComponent(waConsultationMessage)}`;

  const handleWhatsAppConsultation = () => {
    trackWhatsAppConsultation({
      name: product.name,
      price: basePrice
    });
    window.open(waConsultationUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenCheckout = () => {
    triggerAddToCart();
    triggerInitiateCheckout();
    const checkoutEl = document.getElementById('checkout-section');
    if (checkoutEl) {
      checkoutEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      setCheckoutOpen(true);
    }
  };

  const handleDirectCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (isPhysical && (!shippingAddress || !shippingCity)) {
      setErrorMessage('Silakan lengkapi alamat dan kota pengiriman produk fisik.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const currentRef = affiliateCode || getActiveAffiliateCode() || undefined;
    const trackingParams = getTrackingData();

    try {
      const result = await createOrderAndInvoice({
        tenantSlug: tenant,
        productId: String(product.id || slug),
        productTitle: product.name,
        amount: totalAmount,
        basePrice,
        productDiscount,
        netProductPrice,
        shippingCost: baseShippingCost,
        shippingSubsidy,
        netShippingCost,
        shippingAddress: isPhysical ? `${shippingAddress}, ${shippingCity}` : undefined,
        shippingCourier: isPhysical ? (selectedShipping.eta ? `${selectedShipping.name} (${selectedShipping.eta})` : selectedShipping.name) : undefined,
        voucherCode: appliedVoucher?.code || undefined,
        adminFee: 0,
        uniqueCode: currentUniqueCode,
        paymentMethod,
        affiliateCommission: 0,
        customerName: buyerName,
        customerPhone: buyerPhone,
        customerEmail: buyerEmail,
        affiliateCode: undefined, // Murni direct store ke toko merchant
        tracking: trackingParams
      });

      if (result?.orderId) {
        trackClientPurchase(result.orderId, totalAmount);
      }

      // Redirect langsung ke rincian invoice presisi
      router.push(result.invoiceUrl || `/checkout/${result.orderId}`);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMessage(err.message || 'Gagal memproses pesanan.');
    } finally {
      setLoading(false);
    }
  };

  const renderCheckoutForm = () => (
    <form onSubmit={handleDirectCheckout} className="space-y-4 text-xs">
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Input Data Pembeli: Hanya 3 Field (Ultra-Lean Single Section) */}
      <div className="space-y-3">
        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Nama Lengkap <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="Contoh: Budi Pratama"
            value={buyerName}
            onFocus={() => { triggerAddToCart(); triggerInitiateCheckout(); }}
            onChange={(e) => setBuyerName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-sm md:text-xs transition"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Nomor WhatsApp Aktif <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            required
            placeholder="Contoh: 081234567890"
            value={buyerPhone}
            onFocus={() => { triggerAddToCart(); triggerInitiateCheckout(); }}
            onChange={(e) => setBuyerPhone(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-sm md:text-xs font-mono transition"
          />
        </div>

        <div>
          <label className="font-bold text-slate-700 block mb-1">
            Alamat Email <span className="text-rose-500">*</span>
          </label>
          <input
            type="email"
            required
            placeholder="nama@email.com"
            value={buyerEmail}
            onFocus={() => { triggerAddToCart(); triggerInitiateCheckout(); }}
            onChange={(e) => setBuyerEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-sm md:text-xs transition"
          />
        </div>
      </div>

      {/* Opsi Metode Pembayaran (Disesuaikan dari Konfigurasi Toko) */}
      <div className="space-y-2 pt-2">
        <label className="font-bold text-slate-700 block">Pilih Metode Pembayaran</label>
        
        {/* QRIS Option (Jika Diaktifkan) */}
        {allowQris && (
          <label
            onClick={() => { setPaymentMethod('qris'); triggerAddPaymentInfo('qris'); }}
            className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
              paymentMethod === 'qris'
                ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500/30'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
            }`}
          >
            <input
              type="radio"
              name="payment_method"
              checked={paymentMethod === 'qris'}
              onChange={() => { setPaymentMethod('qris'); triggerAddPaymentInfo('qris'); }}
              className="mt-1 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>QRIS Instan (Semua Bank & e-Wallet)</span>
                </div>
                <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">
                  Bebas Biaya Admin / Paling Cepat
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                BCA, Mandiri, BRI, BNI, GoPay, OVO, ShopeePay, DANA. Biaya admin: <strong>Rp 0</strong>.
              </p>
            </div>
          </label>
        )}

        {/* Transfer Manual Option (Jika Diaktifkan) */}
        {allowManual && (
          <label
            onClick={() => { setPaymentMethod('manual_transfer'); triggerAddPaymentInfo('manual_transfer'); }}
            className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
              paymentMethod === 'manual_transfer'
                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
            }`}
          >
            <input
              type="radio"
              name="payment_method"
              checked={paymentMethod === 'manual_transfer'}
              onChange={() => { setPaymentMethod('manual_transfer'); triggerAddPaymentInfo('manual_transfer'); }}
              className="mt-1 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Transfer Bank Manual</span>
                </div>
                <span className="bg-blue-100 text-blue-800 font-semibold text-[10px] px-2 py-0.5 rounded-md">
                  Bebas Biaya Admin + Kode Unik
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Transfer langsung ke rekening BCA / Mandiri seller tanpa biaya admin. Dilengkapi 3 digit kode unik acak verifikasi.
              </p>
            </div>
          </label>
        )}
      </div>

      {/* Khusus Produk Fisik: Alamat & Opsi Pengiriman */}
      {isPhysical && (
        <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
            <Package className="w-4 h-4 text-amber-700" />
            <span>Alamat & Ekspedisi Pengiriman Produk Fisik</span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Alamat Lengkap Rumah / Kantor <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                required={isPhysical}
                placeholder="Jl. Nama Jalan, No. Rumah, RT/RW, Kelurahan, Kecamatan"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 text-xs"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Kota / Kabupaten & Kode Pos <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required={isPhysical}
                placeholder="Contoh: Bandung, 40286"
                value={shippingCity}
                onChange={(e) => setShippingCity(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                💡 Masukkan kota &quot;Bandung&quot; atau kode pos 40xxx untuk mengaktifkan opsi kurir instan (GoSend &amp; GrabExpress 1-2 Jam via Biteship).
              </span>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 block text-xs">Pilih Layanan Kurir</label>
                {isLoadingInstant && (
                  <span className="text-[10px] text-blue-600 flex items-center gap-1 font-semibold animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Menghitung tarif instan Biteship...
                  </span>
                )}
              </div>

              {/* 1. Kurir Reguler & Kargo */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kurir Reguler &amp; Kargo</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {BASE_SHIPPING_OPTIONS.map((opt) => (
                    <div
                      key={opt.id}
                      onClick={() => { setSelectedShippingId(opt.id); triggerAddPaymentInfo(); }}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        selectedShippingId === opt.id
                          ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-slate-900 text-[11px]">{opt.name}</div>
                      <div className="text-[10px] text-slate-500">{opt.eta}</div>
                      <div className="text-xs font-black text-blue-600 mt-1">
                        Rp {opt.price.toLocaleString('id-ID')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Opsi Kurir Instan Biteship (Muncul jika alamat / kota Bandung terdeteksi) */}
              {instantCouriers.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-amber-200/70 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                      Kurir Instan Biteship (Area Bandung)
                    </span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Tiba Hari Ini (1-2 Jam)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {instantCouriers.map((opt) => (
                      <div
                        key={opt.id}
                        onClick={() => { setSelectedShippingId(opt.id); triggerAddPaymentInfo(); }}
                        className={`p-2.5 rounded-xl border cursor-pointer transition ${
                          selectedShippingId === opt.id
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/30 shadow-xs'
                            : 'bg-white border-emerald-200 hover:border-emerald-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-[11px]">{opt.name}</span>
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            {opt.eta}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {opt.name} - {opt.eta}: Rp {opt.price.toLocaleString('id-ID')}
                        </div>
                        <div className="text-xs font-black text-emerald-700 mt-1 flex items-center justify-between">
                          <span>Rp {opt.price.toLocaleString('id-ID')}</span>
                          <span className="text-[9px] text-emerald-600 font-semibold">{opt.badge || 'Instan'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input Kode Voucher Promo Fleksibel */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-900">
            <Tag className="w-3.5 h-3.5 text-indigo-600" />
            <span>Punya Kode Voucher?</span>
          </div>
          {appliedVoucher && (
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {appliedVoucher.code} Aktif
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={voucherInput}
            onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
            placeholder="Masukkan kode voucher (mis: HEMAT50)"
            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase text-slate-900 focus:outline-none focus:border-indigo-600"
          />
          <button
            type="button"
            onClick={() => handleApplyVoucher()}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Terapkan
          </button>
          {appliedVoucher && (
            <button
              type="button"
              onClick={handleRemoveVoucher}
              title="Hapus Voucher"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {voucherMsg && (
          <div className={`text-[11px] font-semibold flex items-center gap-1.5 ${
            voucherMsg.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {voucherMsg.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{voucherMsg.text}</span>
          </div>
        )}
      </div>

      {/* Rincian Kalkulasi Pembayaran Presisi */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>Harga Dasar Produk</span>
          <span className="font-semibold text-slate-900">Rp {basePrice.toLocaleString('id-ID')}</span>
        </div>

        {productDiscount > 0 && (
          <div className="flex justify-between text-indigo-600 font-semibold">
            <span>Diskon Voucher ({appliedVoucher?.code})</span>
            <span>-Rp {productDiscount.toLocaleString('id-ID')}</span>
          </div>
        )}

        {productDiscount > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>Harga Bersih Produk</span>
            <span className="font-semibold text-slate-900">Rp {netProductPrice.toLocaleString('id-ID')}</span>
          </div>
        )}

        {isPhysical && (
          <div className="flex justify-between text-slate-600">
            <span>Ongkos Kirim ({selectedShipping.name})</span>
            <span className="font-semibold text-slate-900">Rp {baseShippingCost.toLocaleString('id-ID')}</span>
          </div>
        )}

        {isPhysical && shippingSubsidy > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>Subsidi Bebas Ongkir</span>
            <span>-Rp {shippingSubsidy.toLocaleString('id-ID')}</span>
          </div>
        )}

        <div className="flex justify-between text-slate-600">
          <span>Biaya Layanan & Admin</span>
          <span className="font-semibold text-emerald-600">
            Rp 0 (Bebas Biaya Admin)
          </span>
        </div>

        {paymentMethod === 'manual_transfer' && (
          <div className="flex justify-between text-slate-600">
            <span>Kode Unik Verifikasi</span>
            <span className="font-mono font-semibold text-blue-600">+{currentUniqueCode}</span>
          </div>
        )}

        <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline font-bold">
          <span className="text-slate-900">Total Pembayaran</span>
          <span className="text-base font-black text-emerald-600">
            Rp {totalAmount.toLocaleString('id-ID')}
          </span>
        </div>

        {/* Kupon & Jaminan Transaksi Langsung */}
        <div className="pt-1 text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-200/60">
          <span>{appliedVoucher ? `Voucher: ${appliedVoucher.code}` : `Kupon: ${config.discount_coupon || 'HEMAT50'}`}</span>
          <span className="text-emerald-600 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>Direct Store (100% Toko Resmi)</span>
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition disabled:opacity-75 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memproses Pesanan...</span>
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" />
            <span>Bayar Sekarang (Rp {totalAmount.toLocaleString('id-ID')})</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* ── CTA KONSULTASI WHATSAPP SEKUNDER (Jalur Chat-to-Close) ── */}
      <button
        type="button"
        onClick={handleWhatsAppConsultation}
        className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-[0.99]"
      >
        <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>💬 Masih ragu atau ingin tanya dulu? Hubungi Asisten WhatsApp</span>
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Keamanan transaksi 256-bit terenkripsi SSL & QRIS resmi Bank Indonesia</span>
      </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans pb-28 selection:bg-blue-600 selection:text-white">
      {/* 1. Header Minimalis Brand */}
      <header className="border-b border-slate-100 py-3.5 px-4 sticky top-0 bg-white/95 backdrop-blur z-30 flex items-center justify-between max-w-2xl mx-auto">
        <div className="text-xs font-black uppercase tracking-wider text-blue-600">
          {tenant.toUpperCase()} OFFICIAL
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Garansi Akses Resmi</span>
        </div>
      </header>

      {/* 2. Main Offer Content (Formula Konversi Tinggi) */}
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-7">
        {/* 1. Hero Section (Hook + Banner) */}
        <section className="space-y-4">
          <div className="aspect-video w-full rounded-3xl bg-gradient-to-tr from-slate-900 via-slate-900 to-blue-950 flex items-center justify-center text-white overflow-hidden shadow-xl border border-slate-200 relative">
            {config.banner_url && config.banner_url.startsWith('http') ? (
              <img 
                src={config.banner_url} 
                alt={product.name} 
                className="w-full h-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent flex items-end p-5 sm:p-7">
              <div className="text-left">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-tight drop-shadow-sm">
                  {product.name}
                </h2>
              </div>
            </div>
          </div>

          {/* Pricing & Value Proposition */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-3xl sm:text-4xl font-black text-slate-900">
                Rp {basePrice.toLocaleString('id-ID')}
              </span>
              <span className="text-sm line-through text-slate-400 font-semibold">
                Rp {promoPrice.toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-black text-rose-600 bg-rose-50 border border-rose-200/60 px-2.5 py-0.5 rounded-full">
                Diskon Spesial Hari Ini
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-snug">
              {config.headline || product.name}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
              {config.subheadline || product.description}
            </p>

            {/* Quick Action Scroll CTA */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleOpenCheckout}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition cursor-pointer text-sm"
              >
                <span>Daftar & Ambil Penawaran Sekarang</span>
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* 2. Problem Section (Pain Points + Ilustrasi) */}
        {config.pain_points && config.pain_points.length > 0 && (
          <section className="bg-rose-50/70 border border-rose-200/80 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
              {config.problem_title || 'Apakah Anda Sering Mengalami Masalah Ini?'}
            </h2>
            <div className="space-y-2.5">
              {config.pain_points.map((point, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-white border border-rose-100/90 rounded-2xl shadow-xs">
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">{point}</span>
                </div>
              ))}
            </div>
            {config.problem_image_url && (
              <div className="rounded-2xl overflow-hidden border border-rose-200/80 shadow-sm mt-3 bg-white">
                <img 
                  src={config.problem_image_url} 
                  alt="Ilustrasi Masalah" 
                  className="w-full h-auto max-h-72 object-cover"
                />
              </div>
            )}
          </section>
        )}

        {/* 3. Solution Section (Fitur Unggulan) */}
        {config.solution_points && config.solution_points.length > 0 ? (
          <section className="bg-emerald-50/60 border border-emerald-200/80 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
              {config.solution_title || 'Solusi Tepat yang Didesain Khusus Untuk Anda'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config.solution_points.map((point, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-3.5 bg-white border border-emerald-100 rounded-2xl shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm text-slate-800 font-semibold leading-snug">{point}</span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          /* Safe Fallback jika belum mengisi solution points */
          <section className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 sm:p-6 space-y-3 shadow-xs">
            <h3 className="text-base font-black text-slate-900 leading-snug">Materi &amp; Fasilitas Utama</h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Full Video Tutorial & Panduan Eksekusi Praktis 2026</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Struktur materi teruji dengan studi kasus nyata</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Dukungan update berkelanjutan via portal akses resmi</span>
              </li>
            </ul>
          </section>
        )}

        {/* 4. Tabel Perbandingan Responsif (Us vs Them) */}
        {config.comparison_rows && config.comparison_rows.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                Kenapa Memilih Solusi Kami Dibanding Cara Lain?
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Perbedaan nyata efisiensi, akurasi, dan hasil yang akan Anda dapatkan:
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {config.comparison_rows.map((row, idx) => (
                <div key={row.id || idx} className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/50 shadow-xs">
                  <div className="bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-800 border-b border-slate-200">
                    {row.feature}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                    {/* Them / Cara Lama */}
                    <div className="p-3.5 bg-rose-50/40 flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Cara Lain / Lama</span>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{row.others}</p>
                      </div>
                    </div>
                    {/* Us / Solusi Kami */}
                    <div className="p-3.5 bg-emerald-50/50 flex items-start gap-2.5 border-l-2 border-emerald-500 sm:border-l-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Solusi Produk Ini</span>
                        <p className="text-xs font-bold text-slate-900 mt-1 leading-relaxed">{row.us}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. Galeri Testimoni Visual (Grid Screenshot) */}
        {config.testimonial_images && config.testimonial_images.length > 0 && (
          <section className="bg-slate-50/90 border border-slate-200/90 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-amber-500 font-bold text-xs">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-slate-800 font-bold text-xs ml-1">5.0 / 5.0 Rating Kepuasan</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">Hasil Nyata Member</span>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                Bukti Nyata & Kepuasan Pengguna
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Screenshot asli pengalaman dan hasil nyata dari mereka yang telah bergabung:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
              {config.testimonial_images.map((imgUrl, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs hover:shadow-md transition group">
                  <div className="overflow-hidden bg-slate-100">
                    <img 
                      src={imgUrl} 
                      alt={`Bukti Testimoni ${idx + 1}`} 
                      className="w-full h-48 sm:h-52 object-cover object-top group-hover:scale-105 transition duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5 bg-white text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100">
                    <span className="font-semibold text-slate-700">Verified User</span>
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Sukses
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. Irresistible Offer & Bonus Box */}
        {config.bonus_items && config.bonus_items.length > 0 && (
          <section className="bg-gradient-to-br from-amber-50 via-yellow-50/60 to-orange-50/40 border-2 border-amber-300/90 rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                Dapatkan Ekstra Bonus Eksklusif Senilai {totalBonusValue > 0 ? `Rp ${totalBonusValue.toLocaleString('id-ID')}` : 'Ratusan Ribu Rupiah'}
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Semua bonus berharga di bawah ini otomatis menjadi milik Anda 100% GRATIS saat menyelesaikan pesanan sekarang:
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {config.bonus_items.map((bonus, idx) => (
                <div key={bonus.id || idx} className="p-3.5 bg-white/95 border border-amber-200 rounded-2xl shadow-xs flex items-start gap-3">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                    <Gift className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900">{bonus.title}</h4>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">
                        Senilai Rp {bonus.value.toLocaleString('id-ID')} (GRATIS)
                      </span>
                    </div>
                    {bonus.description && (
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{bonus.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalBonusValue > 0 && (
              <div className="p-3 bg-amber-200/60 rounded-xl border border-amber-300/80 text-center text-xs font-bold text-amber-950">
                🎉 Total Nilai Semua Bonus: Rp {totalBonusValue.toLocaleString('id-ID')} (100% Bebas Biaya)
              </div>
            )}
          </section>
        )}

        {/* 7. Ultra-Lean Single Page Checkout Section */}
        <section id="checkout-section" className="bg-white border-2 border-blue-600/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">Form Pemesanan &amp; Pembayaran</h2>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-semibold">Total Tagihan</span>
              <span className="text-sm font-black text-emerald-600">Rp {totalAmount.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {renderCheckoutForm()}
        </section>
      </main>

      {/* 4. Sticky Bottom CTA (Mobile & Desktop) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-4 z-40 backdrop-blur shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Investasi</span>
            <span className="text-lg font-black text-slate-900">Rp {totalAmount.toLocaleString('id-ID')}</span>
          </div>
          <button
            onClick={handleOpenCheckout}
            className="flex-1 max-w-xs py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer"
          >
            <span>Daftar & Bayar Instan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5. Instant Checkout Modal Fallback */}
      {checkoutOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Single Page Checkout Form</span>
              </h3>
              <button 
                onClick={() => setCheckoutOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renderCheckoutForm()}
          </div>
        </div>
      )}

      {/* ── FLOATING WHATSAPP BUTTON (POJOK KANAN BAWAH) ── */}
      <div className="fixed bottom-24 sm:bottom-20 right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={handleWhatsAppConsultation}
          title="Hubungi Asisten WhatsApp"
          className="group relative flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-full shadow-2xl shadow-emerald-600/40 border border-emerald-400/40 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-300"></span>
          </span>
          <MessageCircle className="w-5 h-5 text-white shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap hidden sm:inline">
            Tanya Asisten WhatsApp
          </span>
        </button>
      </div>
    </div>
  );
}

export default function SingleProductPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400 font-mono">Memuat penawaran eksklusif...</div>}>
      <SingleProductContent />
    </Suspense>
  );
}