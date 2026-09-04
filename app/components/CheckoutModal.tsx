"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, QrCode, ArrowRight, Loader2, CheckCircle2, Building2, Lock } from "lucide-react";
import { createOrderAndInvoice } from "@/lib/checkout-service";
import { getActiveAffiliateCode, getTrackingData, trackClientPurchase } from "@/lib/tracking";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  product: {
    id: string;
    title: string;
    price: number;
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
  const [qrData, setQrData] = useState<{ orderId: string; invoiceUrl?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    const trackingParams = getTrackingData();

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
        customerEmail,
        affiliateCode: undefined, // Murni direct store ke toko merchant
        tracking: trackingParams,
      });

      // Trigger Client-side Purchase Event dengan Deduplikasi Key
      if (result?.orderId) {
        trackClientPurchase(result.orderId, totalAmount);
      }

      setQrData({
        orderId: result.orderId,
        invoiceUrl: result.invoiceUrl,
      });
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

        {qrData ? (
          /* Tampilan Selesai / Menunggu Pembayaran */
          <div className="text-center space-y-4 py-4">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-white text-base">Pesanan Berhasil Dibuat!</h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Order ID: {qrData.orderId}</p>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
              Silakan selesaikan pembayaran. Rincian invoice dan nomor rekening/QR telah siap. Notifikasi transaksi otomatis dikirim ke WhatsApp Anda (<strong>{customerPhone}</strong>).
            </p>

            {qrData.invoiceUrl && (
              <a
                href={qrData.invoiceUrl}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
              >
                <ArrowRight className="w-4 h-4" /> Buka Halaman Rincian Invoice
              </a>
            )}
          </div>
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
                <label className="text-slate-400 font-medium">Alamat Email *</label>
                <input
                  type="email"
                  required
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
                  <p className="text-[10px] text-slate-400 mt-0.5">Transfer langsung via BCA / Mandiri seller tanpa biaya admin dengan 3 digit kode verifikasi.</p>
                </div>
              </label>
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