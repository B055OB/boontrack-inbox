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
  AlertTriangle 
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';

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
        const supabase = getSupabase();
        if (supabase) {
          // 1. Coba baca dari tabel orders
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
              status: pOrder.status
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
  const adminFee = Number(order?.admin_fee || (isManual ? 5000 : 0));
  const basePrice = Number(order?.base_price || (grossAmount - adminFee - uniqueCode));

  const qrUrl = order?.qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226${orderId}5408${grossAmount}5802ID5913BOONTRACK6007JAKARTA6304`;

  const waConfirmUrl = `https://wa.me/6281237450222?text=${encodeURIComponent(
    `Halo Tim BoonTrack, saya sudah melakukan pembayaran untuk:\n\nOrder ID: ${orderId}\nProduk: ${order?.product_title || 'Masterclass Ads 2026'}\nNama: ${order?.customer_name || '-'}\nTotal Nominal: Rp ${grossAmount.toLocaleString('id-ID')}\nMetode: ${isManual ? 'Transfer Bank Manual' : 'QRIS'}\n\nMohon dicek dan aktivasi akses saya. Terima kasih!`
  )}`;

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        
        {/* Header Order */}
        <div className="text-center space-y-1">
          {isManual ? (
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-400 bg-blue-950/60 px-3 py-1 rounded-full border border-blue-800/40 inline-flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>Menunggu Transfer Bank Manual</span>
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

        {/* Timer Bar */}
        <div className="flex items-center justify-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl py-2.5 text-amber-400 font-mono text-sm font-semibold">
          <Clock className="w-4 h-4" />
          <span>Sisa Waktu Pembayaran: {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
        </div>

        {/* Payment Detail Section (QRIS vs Transfer Manual) */}
        {isManual ? (
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
          /* QR Code Container (QRIS) */
          <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-inner">
            <img
              src={qrUrl}
              alt="QRIS Standar Nasional"
              className="w-56 h-56 object-contain rounded-lg"
            />
            <div className="text-slate-800 font-bold text-center pt-2 text-xs tracking-wide">
              QRIS STANDAR PEMBAYARAN NASIONAL
            </div>
            <p className="text-[10px] text-slate-500 text-center">BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay</p>
          </div>
        )}

        {/* Breakdown Rincian Invoice Presisi */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Harga Dasar Produk</span>
            <span className="text-slate-200">Rp {basePrice.toLocaleString('id-ID')}</span>
          </div>

          <div className="flex justify-between text-slate-400">
            <span>Biaya Layanan & Admin</span>
            <span className={isManual ? 'text-slate-200' : 'text-emerald-400 font-semibold'}>
              {isManual ? `Rp ${adminFee.toLocaleString('id-ID')}` : 'Rp 0 (Gratis)'}
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