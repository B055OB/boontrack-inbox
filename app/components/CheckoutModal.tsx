"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, QrCode, ArrowRight, Loader2, CheckCircle2, Building2, Lock, Copy, Check, MessageSquare, AlertTriangle, Download, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createOrderAndInvoice } from "@/lib/checkout-service";
import { getActiveAffiliateCode, getTrackingData, trackClientPurchase, trackLeadFormSubmission, formatIndonesianWhatsAppNumber } from "@/lib/tracking";
import { generateDynamicQRIS } from "@/lib/qris-dynamic";
import { getSupabase } from "@/lib/supabaseClient";
import { extractTenantBankAccounts, TenantBankAccount } from "@/lib/bank-accounts";

const STATIC_QRIS = process.env.NEXT_PUBLIC_BOONTRACK_STATIC_QRIS || "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1";

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
  } | null;
}

export default function CheckoutModal({ isOpen, onClose, tenantSlug, product }: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'manual_transfer'>('qris');
  const [uniqueCode] = useState(() => Math.floor(100 + Math.random() * 900));
  const [affiliateCode, setAffiliateCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    orderId: string;
    invoiceUrl?: string;
    qr_string?: string;
    qrString?: string;
    qrCodeUrl?: string;
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
  const currentUniqueCode = paymentMethod === 'manual_transfer' ? uniqueCode : 0;
  const totalAmount = basePrice + adminFee + currentUniqueCode;
  const affiliateCommission = 0; // Fitur affiliate produk ritel dinonaktifkan sementara (murni direct store)

  useEffect(() => {
    const activeRef = getActiveAffiliateCode();
    if (activeRef) {
      setAffiliateCode(activeRef);
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
              const accounts = extractTenantBankAccounts(data);
              setBankAccounts(accounts);
              if (accounts.length === 0) {
                setPaymentMethod('qris');
              }
            }
          }
        } catch {}
      }
      loadTenant();
    }
  }, [isOpen, tenantSlug]);

  // Real-time polling to detect when order is paid
  useEffect(() => {
    if (!paymentData?.orderId) return;

    let active = true;
    const checkStatus = async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: ord } = await supabase
            .from('orders')
            .select('status, payment_status, download_url, fulfillment_metadata')
            .eq('id', paymentData.orderId)
            .maybeSingle();

          if (ord && active) {
            const statusUpper = (ord.payment_status || ord.status || '').toUpperCase();
            if (statusUpper === 'PAID' || statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS' || statusUpper === 'SETTLED') {
              setOrderStatus('PAID');
              const resolvedAccess =
                ord.fulfillment_metadata?.access_url ||
                ord.download_url ||
                product?.download_url ||
                product?.link_digital ||
                product?.delivery_url;

              setOrderFulfillment({
                access_url: resolvedAccess,
                instructions: ord.fulfillment_metadata?.instructions,
              });
            }
          }
        }
      } catch {}
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [paymentData?.orderId, product]);

  if (!isOpen || !product) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    const trackingParams = getTrackingData();
    const resolvedProductType =
      product.type ||
      product.product_type ||
      (product.category === 'digital' ? 'DIGITAL' : 'DIGITAL');

    const resolvedAccessUrl =
      product.download_url ||
      product.link_digital ||
      product.delivery_url ||
      product.fulfillment_metadata?.access_url ||
      '';

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
        customerEmail: customerEmail || undefined,
        affiliateCode: undefined, // Murni direct store ke toko merchant
        tracking: trackingParams,
        productType: resolvedProductType,
        fulfillmentMetadata: product.fulfillment_metadata || (resolvedAccessUrl ? {
          delivery_type: 'DOWNLOAD_LINK',
          access_url: resolvedAccessUrl,
          instructions: 'Akses materi digital Anda telah aktif secara instan.'
        } : undefined),
      });

      // Trigger Client-side Purchase Event dengan Deduplikasi Key
      if (result?.orderId) {
        trackClientPurchase(result.orderId, totalAmount);
        // Lead / SubmitForm event: form submission berhasil
        trackLeadFormSubmission(totalAmount);
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
                onClick={onClose}
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
                <h4 className="font-black text-white text-base">Akses Produk Digital Siap!</h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Order ID: {paymentData.orderId}</p>
              </div>

              <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 text-left space-y-3 shadow-inner">
                {orderFulfillment?.access_url ? (
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
              const candidateQris = paymentData.qr_string || paymentData.qrString || STATIC_QRIS;
              const qrisValue = candidateQris.includes('010211')
                ? generateDynamicQRIS(candidateQris, totalAmount)
                : candidateQris;

              const cleanWa = formatIndonesianWhatsAppNumber(tenantPhone || '6281237450222');
              const waConfirmUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(
                `Halo Admin, saya ingin konfirmasi pembayaran untuk Order ID: ${paymentData.orderId}\nProduk: ${product.title}\nNominal: Rp ${totalAmount.toLocaleString('id-ID')}`
              )}`;

              return (
                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center my-2 shadow-inner">
                    <div className="p-2.5 bg-white rounded-xl flex items-center justify-center">
                      {paymentData.qrCodeUrl && !qrisError ? (
                        <img
                          src={paymentData.qrCodeUrl}
                          alt="QRIS Pembayaran"
                          onError={() => setQrisError(true)}
                          className="w-56 h-56 object-contain rounded-xl"
                        />
                      ) : (
                        <QRCodeSVG
                          value={qrisValue}
                          size={220}
                          level="M"
                          includeMargin={true}
                        />
                      )}
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
              {affiliateCode && (
                <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1 pt-1">
                  <ShieldCheck className="w-3 h-3" /> Reff: {affiliateCode} (Komisi 30%: Rp {affiliateCommission.toLocaleString("id-ID")})
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-[11px]">
                {errorMessage}
              </div>
            )}

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

              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Alamat Email (Opsional untuk backup link)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-sm md:text-xs"
                />
              </div>
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
              <div className="flex justify-between">
                <span>Biaya Layanan & Admin</span>
                <span className="text-emerald-400 font-semibold">
                  Rp 0 (Bebas Biaya Admin)
                </span>
              </div>
              {paymentMethod === 'manual_transfer' && (
                <div className="flex justify-between">
                  <span>Kode Unik Verifikasi</span>
                  <span className="font-mono text-blue-400">+{currentUniqueCode}</span>
                </div>
              )}
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