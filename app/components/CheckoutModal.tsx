"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, QrCode, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
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
  const [affiliateCode, setAffiliateCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<{ orderId: string; invoiceUrl?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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

    const currentRef = affiliateCode || getActiveAffiliateCode() || undefined;
    const trackingParams = getTrackingData();

    try {
      const result = await createOrderAndInvoice({
        tenantSlug,
        productId: product.id,
        productTitle: product.title,
        amount: product.price,
        customerName,
        customerPhone,
        customerEmail,
        affiliateCode: currentRef,
        tracking: trackingParams,
      });

      // Trigger Client-side Purchase Event dengan Deduplikasi Key
      if (result?.orderId) {
        trackClientPurchase(result.orderId, product.price);
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
            <h3 className="text-base font-bold text-white">Instant Checkout</h3>
            <p className="text-[11px] text-slate-400">Pembayaran Instan via QRIS Real-time</p>
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
              Silakan selesaikan pembayaran. Notifikasi konfirmasi dan link akses produk akan otomatis dikirimkan ke nomor WhatsApp Anda (<strong>{customerPhone}</strong>).
            </p>

            {qrData.invoiceUrl && (
              <a
                href={qrData.invoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <QrCode className="w-4 h-4" /> Buka Halaman Pembayaran QRIS
              </a>
            )}
          </div>
        ) : (
          /* Form Data Pembeli */
          <form onSubmit={handleCheckout} className="space-y-4 text-xs">
            {/* Ringkasan Produk */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex justify-between font-bold text-white">
                <span className="line-clamp-1">{product.title}</span>
                <span className="text-emerald-400 shrink-0 ml-2">
                  Rp {product.price.toLocaleString("id-ID")}
                </span>
              </div>
              {affiliateCode && (
                <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1 pt-1">
                  <ShieldCheck className="w-3 h-3" /> Reff: {affiliateCode}
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-[11px]">
                {errorMessage}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Nama Lengkap</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Contoh: Budi Pratama"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-base md:text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Nomor WhatsApp Aktif</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-base md:text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Email (Opsional)</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-base md:text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membuat Pembayaran...</span>
                </>
              ) : (
                <>
                  <span>Lanjut ke Pembayaran QRIS</span>
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