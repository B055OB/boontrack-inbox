'use client';

import { useState, useEffect } from 'react';
import { QrCode, Clock, MessageSquare, CheckCircle, ShieldCheck } from 'lucide-react';

interface Props {
  params: { order_id: string };
}

export default function CheckoutPage({ params }: Props) {
  const [timeLeft, setTimeLeft] = useState(900); // 15 menit
  const [order, setOrder] = useState<any>(null);
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    // 1. Fetch Order Data
    fetch(`${process.env.NEXT_PUBLIC_CORE_API}/v1/orders/${params.order_id}`)
      .then((res) => res.json())
      .then((data) => setOrder(data));

    // 2. Countdown Timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [params.order_id]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        
        {/* Header Order */}
        <div className="text-center space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/40">
            Menunggu Pembayaran
          </span>
          <h1 className="text-xl font-bold pt-2">Scan QRIS untuk Membayar</h1>
          <p className="text-xs text-slate-400">Order ID: {params.order_id}</p>
        </div>

        {/* Timer Bar */}
        <div className="flex items-center justify-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl py-2.5 text-amber-400 font-mono text-sm font-semibold">
          <Clock className="w-4 h-4" />
          <span>Sisa Waktu: {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
        </div>

        {/* QR Code Container */}
        <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-inner">
          {order?.qr_code_url ? (
            <img src={order.qr_code_url} alt="QRIS Code" className="w-64 h-64 object-contain" />
          ) : (
            <div className="w-64 h-64 bg-slate-100 flex items-center justify-center text-slate-400 text-xs animate-pulse">
              Memuat QR Code...
            </div>
          )}
          <div className="text-slate-800 font-bold text-center pt-2 text-sm tracking-wide">
            QRIS STANDAR PEMBAYARAN NASIONAL
          </div>
        </div>

        {/* Total Tagihan */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 flex justify-between items-center">
          <span className="text-xs text-slate-400">Total Nominal Unik</span>
          <span className="text-lg font-bold text-emerald-400">
            Rp{order?.total_amount?.toLocaleString('id-ID') || '...'}
          </span>
        </div>

        {/* Dual Delivery Notice */}
        <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-emerald-300">
          <MessageSquare className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>Gambar QRIS & ringkasan tagihan ini juga telah dikirimkan ke WhatsApp Anda. Anda dapat menutup halaman ini dan membayar via WhatsApp.</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Diverifikasi otomatis & terenkripsi 256-bit</span>
        </div>
      </div>
    </div>
  );
}