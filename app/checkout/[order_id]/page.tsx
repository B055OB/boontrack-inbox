'use client';

import React, { useState, useEffect, use } from 'react';
import { Clock, MessageSquare, ShieldCheck, CheckCircle2, QrCode } from 'lucide-react';
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
              customer_name: pOrder.customer_name,
              customer_phone: pOrder.customer_phone,
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

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const grossAmount = order?.gross_amount || order?.total_amount || order?.amount || 99000;
  const qrUrl = order?.qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226${orderId}5408${grossAmount}5802ID5913BOONTRACK6007JAKARTA6304`;

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        
        {/* Header Order */}
        <div className="text-center space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/40">
            Menunggu Pembayaran QRIS
          </span>
          <h1 className="text-xl font-bold pt-2">
            {order?.product_title || 'Pembayaran Pesanan'}
          </h1>
          <p className="text-xs text-slate-400 font-mono">Order ID: {orderId}</p>
        </div>

        {/* Timer Bar */}
        <div className="flex items-center justify-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl py-2.5 text-amber-400 font-mono text-sm font-semibold">
          <Clock className="w-4 h-4" />
          <span>Sisa Waktu: {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
        </div>

        {/* QR Code Container */}
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

        {/* Total Tagihan */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 flex justify-between items-center">
          <span className="text-xs text-slate-400">Total Nominal Pembayaran</span>
          <span className="text-lg font-black text-emerald-400">
            Rp{Number(grossAmount).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Dual Delivery Notice */}
        <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-emerald-300">
          <MessageSquare className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>
            Notifikasi invoice dan rincian transaksi telah dikirimkan ke WhatsApp Anda
            {order?.customer_phone ? ` (${order.customer_phone})` : ''}.
          </span>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span>Diverifikasi otomatis & terenkripsi 256-bit</span>
        </div>
      </div>
    </div>
  );
}